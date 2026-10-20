# frozen_string_literal: true

require "digest"
require "json"

# R2 lifecycle policies cannot identify the successful application deployment pair
# or its transitive indexes. Keep-set cleanup therefore belongs to this release.
module Cataqui
  module Mapshot
    class Retention
      def initialize(state:, storage:, data:)
        @_state = state
        @_storage = storage
        @_data = data
      end

      def clean(timeout: 180, signal: nil)
        state = @_state.read.fetch("value")
        raise "Cleanup requires a completed successful deployment." if state["pending"] || !state["active"]

        keep = Set.new
        [state.fetch("active"), state["previous"]].compact.each do |deployment|
          keep.add(deployment.fetch("artifact").fetch("key"))
          source = deployment.fetch("source")
          release = source.fetch("release")
          prepared = source.fetch("prepared")
          keep.add(release.fetch("pmtiles").fetch("objectKey"))
          keep.add(prepared.fetch("manifestKey"))
          manifest_key = prepared.fetch("manifestKey")
          manifest_sha256 = prepared.fetch("sha256")
          object = @_storage.head_object(key: manifest_key, timeout: timeout, signal: signal)
          raise "Retained dataset metadata is missing." if object.fetch("kind") == "missing"
          bytes = @_storage.read_range(key: manifest_key, offset: 0, length: object.fetch("bytes"), etag: object.fetch("etag"), timeout: timeout, signal: signal)
          raise "Retained dataset metadata failed verification." unless Digest::SHA256.hexdigest(bytes) == manifest_sha256
          manifest = JSON.parse(bytes.dup.force_encoding(Encoding::UTF_8))
          indexes = @_data.validate(kind: "index-manifest", value: manifest)
          if indexes.dig("archive", "id") != release.dig("pmtiles", "id") || indexes.dig("landmarks", "sha256") != release.dig("references", "id") || indexes.dig("landmarks", "key") != release.dig("references", "catalogueKey")
            raise "Retained landmark index does not match its source."
          end

          keep.add(indexes.fetch("landmarks").fetch("key"))
          [indexes.fetch("metadata").fetch("headerRoot"), *indexes.fetch("metadata").fetch("leaves").map { |leaf| leaf.fetch("file") }].each do |file|
            keep.add("source/indexes/v1/#{file.fetch('path')}")
          end
        end

        %w[source/import/attempts/ source/indexes/v1/ deployments/artifacts/].each do |prefix|
          cursor = nil
          cursors = Set.new
          loop do
            page = @_storage.list_page(prefix: prefix, cursor: cursor, timeout: timeout, signal: signal)
            remove = page.fetch("objects").filter_map do |object|
              key = object.fetch("key")
              key unless keep.include?(key)
            end
            @_storage.delete(keys: remove, timeout: timeout, signal: signal) unless remove.empty?
            cursor = page.fetch("cursor")
            break unless cursor
            raise "Cleanup cursor repeated." if cursors.include?(cursor)

            cursors.add(cursor)
          end
        end
      end

    end
  end
end
