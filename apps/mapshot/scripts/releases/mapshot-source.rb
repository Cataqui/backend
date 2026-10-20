# frozen_string_literal: true

require "json"

module Cataqui
  module Mapshot
    # Ruby coordinates resumable source phases; the application importer owns map-data work.
    class Source
      def initialize(state:, reservations:, storage:, archives:, importer:, data:)
        @_state = state
        @_reservations = reservations
        @_storage = storage
        @_archives = archives
        @_importer = importer
        @_data = data
      end

      def prepare(code_revision:, operation:, refresh:, phase:, deadline_at:, timeout: 180, signal: nil)
        state = @_state.read
        active = state.fetch("value").fetch("active")
        pending = state.fetch("value").fetch("pending")
        if pending.nil? && !active.nil? && !refresh
          return _reserve_current_source(
            slot: active.fetch("slot"), source: active.fetch("source"), operation: operation,
            code_revision: code_revision, timeout: timeout, signal: signal
          )
        end
        if !pending.nil? && pending.fetch("codeRevision") != code_revision
          raise "Resume the pinned preparation checkout before preparing a newer deployment."
        end

        slot = pending&.fetch("slot") || ((active&.fetch("slot") == "a") ? "b" : "a")
        key = "source/slots/#{slot}/preparation.json"
        stored = @_storage.read_document(key: key, maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        preparation = if !pending.nil? && stored.fetch("kind") == "document"
          @_data.validate(kind: "preparation", value: stored.fetch("value"))
        end
        if pending.nil?
          archive = @_archives.read_latest(signal: signal)
          same_archive = !active.nil? && active.fetch("source").fetch("release").fetch("pmtiles").fetch("digest").fetch("value") == archive.fetch("blake3") &&
            active.fetch("source").fetch("release").fetch("pmtiles").fetch("bytes") == archive.fetch("bytes")
          if same_archive
            return _reserve_current_source(
              slot: active.fetch("slot"), source: active.fetch("source"), operation: operation,
              code_revision: code_revision, timeout: timeout, signal: signal
            )
          end

          preparation = {
            "operation" => operation,
            "input" => {
              "id" => operation, "archive" => archive, "objectKey" => "source/slots/#{slot}/planet.pmtiles",
            },
            "source" => nil
          }
          written = @_storage.write_document(
            key: key, value: preparation, expected_etag: stored.fetch("kind") == "missing" ? nil : stored.fetch("etag"), timeout: timeout, signal: signal
          )
          raise "Slot preparation changed concurrently." unless written.fetch("kind") == "written"

          @_reservations.begin(operation: operation, code_revision: code_revision, replace_data: !same_archive)
          state = @_state.read
        end

        pending = state.fetch("value").fetch("pending")
        if pending.nil? || ["deploying", "recovering"].include?(pending.fetch("stage"))
          raise "Recover the interrupted deployment before preparing data."
        end
        if preparation.nil? || preparation.fetch("operation") != pending.fetch("operation")
          raise "Pinned source preparation is missing."
        end

        if preparation.fetch("input").nil?
          if preparation.fetch("source").nil? || state.fetch("value").fetch("active")&.fetch("slot") != pending.fetch("slot")
            raise "Pinned source preparation is missing."
          end

          return preparation.fetch("source")
        end

        if pending.fetch("stage") == "clearing"
          # Reservation invalidates retention first; repeated deletion precedes every new upload.
          @_storage.delete(keys: ["source/slots/#{slot}/planet.pmtiles"], timeout: timeout, signal: signal)
          @_state.write(etag: state.fetch("etag"), value: state.fetch("value").merge("pending" => pending.merge("stage" => "preparing")))
        end
        return preparation.fetch("source") unless preparation.fetch("source").nil?

        result = @_importer.run(input: preparation.fetch("input"), phase: phase, deadline_at: deadline_at, signal: signal)
        raise "Map preparation failed: #{result.fetch('code')}. Retry resumes its checkpoint." if result.fetch("kind") == "failed"
        return nil unless result.fetch("kind") == "ready"

        source = {"release" => result.fetch("release"), "prepared" => result.fetch("prepared")}
        stored = @_storage.read_document(key: key, maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        raise "Source preparation disappeared." if stored.fetch("kind") == "missing"

        saved = @_storage.write_document(
          key: key, value: {"operation" => pending.fetch("operation"), "input" => preparation.fetch("input"), "source" => source},
          expected_etag: stored.fetch("etag"), timeout: timeout, signal: signal
        )
        raise "Source preparation changed concurrently." unless saved.fetch("kind") == "written"

        source
      end

      def read_prepared(slot:, operation:, timeout: 180, signal: nil)
        stored = @_storage.read_document(key: "source/slots/#{slot}/preparation.json", maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        return nil if stored.fetch("kind") == "missing"

        preparation = @_data.validate(kind: "preparation", value: stored.fetch("value"))
        return nil if preparation.fetch("operation") != operation

        preparation.fetch("source")
      end

      private

      def _reserve_current_source(slot:, source:, operation:, code_revision:, timeout:, signal:)
        key = "source/slots/#{slot}/preparation.json"
        existing = @_storage.read_document(key: key, maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        written = @_storage.write_document(
          key: key, value: {"operation" => operation, "input" => nil, "source" => source},
          expected_etag: existing.fetch("kind") == "missing" ? nil : existing.fetch("etag"), timeout: timeout, signal: signal
        )
        raise "Slot preparation changed concurrently." unless written.fetch("kind") == "written"

        @_reservations.begin(operation: operation, code_revision: code_revision, replace_data: false)
        source
      end
    end
  end
end
