# frozen_string_literal: true

module Cataqui
  module Mapshot
    class BasemapSourceRefreshError < StandardError
      def initialize(reason:)
        super("Map source refresh is temporarily unavailable.")
        @_reason = reason
      end

      def reason
        @_reason
      end

      def retryable
        true
      end
    end
  end
end
