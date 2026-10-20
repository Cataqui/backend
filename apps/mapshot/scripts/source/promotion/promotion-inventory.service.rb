# frozen_string_literal: true

require "digest"
require "json"

module Cataqui
  module Mapshot
    # R2 can list and copy objects, but cannot derive the exact immutable files
    # selected by a prepared map. This service records only those verified files
    # in bounded copy pages, without downloading the planet or landmark archive.
    class PromotionInventoryService
      def initialize(source:, destination:, domain:)
        @_source = source
        @_destination = destination
        # The authoritative TypeScript manifest schema and PMTiles index library
        # validate the specialized representation; Ruby owns storage and paging.
        @_domain = domain
      end

      def build(id:, source:, timeout: 180, signal: nil)
        signal&.check!
        page_asset_limit = @_domain.promotion_page_asset_limit
        prefix = "source/promotions/v1/#{id}/"
        pages = []
        assets = []
        prepared = source.fetch("prepared")
        release = source.fetch("release")
        archive = release.fetch("pmtiles")
        references = release.fetch("references")
        manifest_key = prepared.fetch("manifestKey")
        manifest_maximum_bytes = prepared.fetch("bytes")
        manifest_sha256 = prepared.fetch("sha256")
        object = @_source.head_object(key: manifest_key, timeout: [15, timeout].min, signal: signal)
        if object.fetch("kind") == "missing" || object.fetch("bytes") < 1 || object.fetch("bytes") > manifest_maximum_bytes
          raise "Source metadata failed integrity verification."
        end
        bytes = @_source.read_range(key: manifest_key, offset: 0, length: object.fetch("bytes"), etag: object.fetch("etag"), timeout: timeout, signal: signal)
        unless Digest::SHA256.hexdigest(bytes) == manifest_sha256
          raise "Source metadata failed integrity verification."
        end
        index_object = {"bytes" => bytes, "etag" => object.fetch("etag")}
        text = index_object.fetch("bytes").dup.force_encoding(Encoding::UTF_8)
        raise ArgumentError, "Prepared source metadata is invalid." unless text.valid_encoding?
        validated = @_domain.validate_index_manifest(value: JSON.parse(text.delete_prefix("\uFEFF")))
        index = validated.fetch("manifest")
        unless index_object.fetch("bytes").bytesize == prepared.fetch("bytes") &&
            index.fetch("archive").fetch("id") == archive.fetch("id") &&
            index.fetch("archive").fetch("bytes") == archive.fetch("bytes") &&
            index.fetch("archive").fetch("digest").fetch("algorithm") == archive.fetch("digest").fetch("algorithm")
          raise "Prepared source identity mismatch."
        end
        landmarks = index.fetch("landmarks")
        unless landmarks.fetch("key") == references.fetch("catalogueKey") && landmarks.fetch("sha256") == references.fetch("id")
          raise "Prepared landmark identity mismatch."
        end
        files = [
          {"key" => archive.fetch("objectKey"), "bytes" => archive.fetch("bytes"), "etag" => archive.fetch("etag")},
          {"key" => prepared.fetch("manifestKey"), "bytes" => prepared.fetch("bytes"),
           "sha256" => prepared.fetch("sha256"), "etag" => index_object.fetch("etag")},
          {"key" => landmarks.fetch("key"), "bytes" => landmarks.fetch("bytes"), "sha256" => landmarks.fetch("sha256")}
        ]
        validated.fetch("files").each do |file|
          files.push({"key" => "source/indexes/v1/#{file.fetch("path")}", "bytes" => file.fetch("bytes"), "sha256" => file.fetch("sha256")})
        end
        files.sort_by! { |file| file.fetch("key") }
        if files.each_cons(2).any? { |left, right| left.fetch("key") == right.fetch("key") }
          raise "Source promotion metadata conflicts."
        end
        files.each_slice(8) do |files|
          signal&.check!
                  # Join every bounded request, including when one fails, so the owning
                  # operation cannot finish while a previous batch is still using R2.
          outcomes = files.map do |file|
            Thread.new do |; object, value|
              object = @_source.head_object(key: file.fetch("key"), timeout: [15, timeout].min, signal: signal)
              if object.fetch("kind") == "missing" || object.fetch("bytes") != file.fetch("bytes") ||
                  (file.key?("etag") && object.fetch("etag") != file.fetch("etag")) ||
                  (file.key?("sha256") && !object["sha256"].nil? && object.fetch("sha256") != file.fetch("sha256"))
                raise "Source promotion object changed."
              end
              value = {"key" => file.fetch("key"), "bytes" => object.fetch("bytes"), "etag" => object.fetch("etag"),
                       "contentType" => object["contentType"] || "application/octet-stream"}
              value["sha256"] = file.fetch("sha256") if file.key?("sha256")
# The complete page is checked once by the authoritative schema before
# publication, avoiding a Node process for every HEAD in a large index.
              [value, nil]
            rescue StandardError => error
              [nil, error]
            end
          end.map(&:value)
          outcomes.each do |asset, error|
            raise error if error

            assets.push(asset)
            next unless assets.length == page_asset_limit

            pages.push(_page(prefix: prefix, assets: assets, timeout: timeout, signal: signal))
            assets = []
          end
        end
        pages.push(_page(prefix: prefix, assets: assets, timeout: timeout, signal: signal)) unless assets.empty?
        manifest = @_domain.validate(kind: "promotion-manifest", value: {"version" => 1, "pages" => pages})
        bytes = JSON.generate(manifest)
        reference = @_domain.validate(kind: "promotion-reference", value: {
                                        "key" => "#{prefix}assets.json", "bytes" => bytes.bytesize, "sha256" => Digest::SHA256.hexdigest(bytes)
                                      })
        @_destination.put_raw(key: reference.fetch("key"), bytes: bytes, content_type: "application/json", timeout: timeout, signal: signal)
        reference
      end

      private

      def _page(prefix:, assets:, timeout:, signal:)
        value = @_domain.validate(kind: "promotion-page", value: {"version" => 1, "assets" => assets})
        bytes = JSON.generate(value)
        sha256 = Digest::SHA256.hexdigest(bytes)
        # Preserve the authoritative schema's field order so retries produce the
        # same immutable JSON, including across the TypeScript/Ruby migration.
        # The enclosing root validates all page descriptors as one batch.
        descriptor = {
          "key" => "#{prefix}pages/#{sha256}.json", "bytes" => bytes.bytesize, "sha256" => sha256
        }
        @_destination.put_raw(key: descriptor.fetch("key"), bytes: bytes, content_type: "application/json", timeout: timeout, signal: signal)
        descriptor
      end
    end
  end
end
