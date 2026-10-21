# frozen_string_literal: true

require "digest"

# Provider tools cannot reserve application data slots or pin successful staging
# data. This orchestration preserves those release fences around R2 promotion.
module Cataqui
  module Mapshot
    class Promotion
      def initialize(state:, staging:, reservations:, storage:, inventory:, copy:, data:)
        @_state = state
        @_staging = staging
        @_reservations = reservations
        @_storage = storage
        @_inventory = inventory
        @_copy = copy
        @_data = data
      end

      def prepare(operation:, code_revision:, promote:, deadline_at:, timeout: 180, signal: nil)
        state = @_state.read
        value = state.fetch("value")
        if !promote && value["active"]
          if value["pending"] && value.dig("pending", "slot") != value.dig("active", "slot")
            raise "Resume the pending map promotion before starting another production deployment."
          end

          @_reservations.begin(operation: operation, code_revision: code_revision, replace_data: false)
          return value.fetch("active").fetch("source")
        end

        selected = @_staging.read.fetch("value")["active"]
        raise "Staging seeding must succeed before production promotion." unless selected

        if value["pending"]
          pending = value.fetch("pending")
          if pending.fetch("codeRevision") != code_revision || %w[deploying recovering].include?(pending.fetch("stage"))
            raise "Recover or resume the pinned deployment before promotion."
          end

          if pending.fetch("slot") == value.dig("active", "slot")
            return value.fetch("active").fetch("source") if value.dig("active", "fingerprint") == selected.fetch("fingerprint")

            @_state.write(etag: state.fetch("etag"), value: value.merge("pending" => nil))
            state = @_state.read
          else
            stored = @_storage.read_document(key: "source/slots/#{pending.fetch('slot')}/promotion.json", maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
            raise "Pinned source promotion is missing." if stored.fetch("kind") == "missing" && pending.fetch("stage") == "preparing"

            unless stored.fetch("kind") == "missing"
              captured = @_data.validate(kind: "promotion", value: stored.fetch("value"))
              if captured.fetch("operation") != pending.fetch("operation") && pending.fetch("stage") == "preparing"
                raise "Pinned source promotion is missing."
              end

              if captured.fetch("operation") == pending.fetch("operation") && @_data.fingerprint(source: captured.fetch("source")) != selected.fetch("fingerprint")
                @_state.write(etag: state.fetch("etag"), value: value.merge("pending" => nil))
                state = @_state.read
              end
            end
          end
        end

        value = state.fetch("value")
        replace_data = value.dig("active", "fingerprint") != selected.fetch("fingerprint")
        pending = @_reservations.begin(operation: Digest::SHA256.hexdigest("#{operation}:#{selected.fetch('fingerprint')}"), code_revision: code_revision, replace_data: replace_data)
        return value.fetch("active").fetch("source") if !replace_data && value["active"]

        key = "source/slots/#{pending.fetch('slot')}/promotion.json"
        stored = @_storage.read_document(key: key, maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        promotion = stored.fetch("kind") == "missing" ? nil : @_data.validate(kind: "promotion", value: stored.fetch("value"))
        if promotion.nil? || promotion.fetch("operation") != pending.fetch("operation")
          inventory = @_inventory.build(id: pending.fetch("operation"), source: selected.fetch("source"), signal: signal)
          promotion = { "operation" => pending.fetch("operation"), "source" => selected.fetch("source"), "inventory" => inventory }
          written = @_storage.write_document(key: key, value: promotion, expected_etag: stored.fetch("kind") == "missing" ? nil : stored.fetch("etag"), timeout: timeout, signal: signal)
          raise "Production selection changed concurrently." unless written.fetch("kind") == "written"
        end

        if pending.fetch("stage") == "clearing"
          @_storage.delete(keys: ["source/slots/#{pending.fetch('slot')}/planet.pmtiles"], timeout: timeout, signal: signal)
          state = @_state.read
          @_state.write(etag: state.fetch("etag"), value: state.fetch("value").merge("pending" => pending.merge("stage" => "preparing")))
        end

        @_copy.copy(operation: pending.fetch("operation"), slot: pending.fetch("slot"), source: promotion.fetch("source"), inventory: promotion.fetch("inventory"), timeout: timeout, deadline_at: deadline_at, signal: signal)
      end
    end
  end
end
