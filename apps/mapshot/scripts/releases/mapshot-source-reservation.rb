# frozen_string_literal: true

module Cataqui
  module Mapshot
    # Reserve the source slot before data writes; GitHub owns activation and recovery.
    class SourceReservation
      def initialize(state:)
        @_state = state
      end

      def begin(operation:, code_revision:, replace_data:)
        state = @_state.read
        value = state.fetch("value")
        pending = value.fetch("pending")
        unless pending.nil?
          if ["deploying", "recovering"].include?(pending.fetch("stage"))
            raise "An interrupted deployment must be recovered before preparing data."
          end
          if pending.fetch("codeRevision") != code_revision
            raise "Resume the pinned preparation revision before starting another deployment."
          end

          return pending
        end

        active = value.fetch("active")
        slot = replace_data ? ((active&.fetch("slot") == "a") ? "b" : "a") : active&.fetch("slot")
        raise "An empty environment must prepare its first dataset." if slot.nil?

        pending = {
          "operation" => operation, "codeRevision" => code_revision, "slot" => slot,
          "stage" => replace_data ? "clearing" : "preparing", "candidate" => nil
        }
        previous = value.fetch("previous")
        previous = nil if replace_data && previous&.fetch("slot") == slot
        @_state.write(
          etag: state.fetch("etag"), value: {"version" => 1, "active" => active, "previous" => previous, "pending" => pending}
        )
        pending
      end
    end
  end
end
