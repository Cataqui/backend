# frozen_string_literal: true

module Cataqui
  module Mapshot
    # R2 conditional writes preserve the release journal across runner interruption.
    class Deployment
      def initialize(storage:, data:)
        @_storage = storage
        @_data = data
      end

      def read
        stored = @_storage.read_document(key: "deployment.json", maximum_bytes: 1024 * 1024, timeout: 15)
        return {"etag" => nil, "value" => {"version" => 1, "active" => nil, "previous" => nil, "pending" => nil}} if stored.fetch("kind") == "missing"

        {"etag" => stored.fetch("etag"), "value" => @_data.validate(kind: "deployment-state", value: stored.fetch("value"))}
      end

      def write(value:, etag:)
        result = @_storage.write_document(
          key: "deployment.json", value: value, expected_etag: etag, timeout: 15
        )
        raise "Mapshot deployment state changed concurrently." unless result.fetch("kind") == "written"
      end
    end
  end
end
