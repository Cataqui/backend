# frozen_string_literal: true

require "digest"
require "json"

# Provider copy APIs move objects, but cannot checkpoint this application's
# inventory, pin source ETags, or reconcile a lost multipart completion reply.
module Cataqui
  module Mapshot
    class Copy
      def initialize(source:, source_bucket:, destination:, data:, clock: -> { (Time.now.to_f * 1000).to_i })
        @_source = source
        @_source_bucket = source_bucket
        @_destination = destination
        @_data = data
        @_clock = clock
      end

      def copy(operation:, slot:, source:, inventory:, deadline_at:, timeout: 180, signal: nil)
        key = "source/slots/#{slot}/copy.json"
        stored = @_destination.read_document(key: key, maximum_bytes: 1024 * 1024, timeout: timeout, signal: signal)
        checkpoint = stored.fetch("kind") == "missing" ? nil : @_data.validate(kind: "copy-checkpoint", value: stored.fetch("value"))
        if checkpoint.nil? || checkpoint.fetch("operation") != operation
          checkpoint = { "operation" => operation, "page" => 0, "asset" => 0, "archiveEtag" => nil, "transfer" => nil }
        end
        etag = stored.fetch("kind") == "missing" ? nil : stored.fetch("etag")
        save = lambda do
          written = @_destination.write_document(key: key, value: checkpoint, expected_etag: etag, timeout: timeout, signal: signal)
          raise "Production copy checkpoint changed concurrently." unless written.fetch("kind") == "written"

          etag = written.fetch("etag")
        end
        save.call
        root = @_data.validate(kind: "promotion-manifest", value: _metadata(descriptor: inventory, timeout: timeout, signal: signal))
        while checkpoint.fetch("page") < root.fetch("pages").length
          page = @_data.validate(kind: "promotion-page", value: _metadata(descriptor: root.fetch("pages").fetch(checkpoint.fetch("page")), timeout: timeout, signal: signal))
          while checkpoint.fetch("asset") < page.fetch("assets").length
            if @_clock.call >= deadline_at
              save.call
              return nil
            end
            asset = page.fetch("assets").fetch(checkpoint.fetch("asset"))
            archive = asset.fetch("key") == source.fetch("release").fetch("pmtiles").fetch("objectKey")
            target = archive ? "source/slots/#{slot}/planet.pmtiles" : asset.fetch("key")
            if asset.fetch("bytes") <= 8 * 1024 * 1024
              bytes = @_source.read_range(key: asset.fetch("key"), offset: 0, length: asset.fetch("bytes"), etag: asset.fetch("etag"), timeout: timeout, signal: signal)
              raise "Staging asset integrity failed." if asset["sha256"] && Digest::SHA256.hexdigest(bytes) != asset.fetch("sha256")

              copied_etag = @_destination.put_raw(key: target, bytes: bytes, content_type: asset.fetch("contentType"), timeout: timeout, signal: signal)
            else
              _verify_source(key: asset.fetch("key"), bytes: asset.fetch("bytes"), etag: asset.fetch("etag"), timeout: timeout, signal: signal)
              unless checkpoint["transfer"]
                upload = @_destination.create_multipart(key: target, timeout: timeout, signal: signal)
                checkpoint["transfer"] = { "key" => target, "uploadId" => upload.fetch("uploadId"), "parts" => [] }
                save.call
              end
              transfer = checkpoint.fetch("transfer")
              raise "Production multipart checkpoint conflicts." unless transfer.fetch("key") == target

              part_bytes = 64 * 1024 * 1024
              offset = transfer.fetch("parts").length * part_bytes
              while offset < asset.fetch("bytes")
                if @_clock.call >= deadline_at
                  save.call
                  return nil
                end
                part_number = transfer.fetch("parts").length + 1
                part_etag = @_destination.copy_part(key: target, source_bucket: @_source_bucket, source_key: asset.fetch("key"), offset: offset, length: [part_bytes, asset.fetch("bytes") - offset].min, upload_id: transfer.fetch("uploadId"), part_number: part_number, timeout: timeout, signal: signal)
                transfer.fetch("parts").push({ "partNumber" => part_number, "etag" => part_etag })
                save.call
                offset += part_bytes
              end
              _verify_source(key: asset.fetch("key"), bytes: asset.fetch("bytes"), etag: asset.fetch("etag"), timeout: timeout, signal: signal)
              digest = Digest::MD5.new
              transfer.fetch("parts").each do |part|
                raise "Unexpected R2 part ETag." unless part.fetch("etag").match?(/\A[a-f0-9]{32}\z/)

                digest.update([part.fetch("etag")].pack("H*"))
              end
              expected = "#{digest.hexdigest}-#{transfer.fetch('parts').length}"
              existing = @_destination.head_object(key: target, timeout: timeout, signal: signal)
              object = if existing.fetch("kind") == "missing" || existing.fetch("etag") != expected
                         @_destination.complete_multipart(key: target, upload_id: transfer.fetch("uploadId"), parts: transfer.fetch("parts"), timeout: timeout, signal: signal)
                       else
                         existing
                       end
              raise "Copied multipart object failed verification." unless object.fetch("bytes") == asset.fetch("bytes") && object.fetch("etag") == expected

              copied_etag = object.fetch("etag")
            end
            checkpoint["archiveEtag"] = copied_etag if archive
            checkpoint["transfer"] = nil
            checkpoint["asset"] += 1
            save.call
          end
          checkpoint["page"] += 1
          checkpoint["asset"] = 0
        end
        save.call
        raise "Production copy omitted its archive." unless checkpoint["archiveEtag"]

        release = source.fetch("release")
        archive = release.fetch("pmtiles")
        promoted_release = @_data.validate(kind: "source-release", value: {
          "schemaVersion" => release.fetch("schemaVersion"),
          "pmtiles" => { "id" => archive.fetch("id"), "objectKey" => "source/slots/#{slot}/planet.pmtiles", "bytes" => archive.fetch("bytes"), "etag" => checkpoint.fetch("archiveEtag"), "digest" => archive.fetch("digest"), "minZoom" => archive.fetch("minZoom"), "maxZoom" => archive.fetch("maxZoom"), "coverage" => archive.fetch("coverage") },
          "references" => release.fetch("references")
        })
        { "release" => promoted_release, "prepared" => source.fetch("prepared") }
      end

      private

      def _verify_source(key:, bytes:, etag:, timeout:, signal:)
        object = @_source.head_object(key: key, timeout: timeout, signal: signal)
        if object.fetch("kind") == "missing" || object.fetch("etag") != etag || object.fetch("bytes") != bytes
          raise "Staging source changed during production copy."
        end
      end

      def _metadata(descriptor:, timeout:, signal:)
        object = @_destination.head_object(key: descriptor.fetch("key"), timeout: timeout, signal: signal)
        if object.fetch("kind") == "missing" || object.fetch("bytes") != descriptor.fetch("bytes") || object.fetch("bytes") > 2 * 1024 * 1024
          raise "Copy inventory unavailable."
        end

        bytes = @_destination.read_range(key: descriptor.fetch("key"), offset: 0, length: object.fetch("bytes"), etag: object.fetch("etag"), timeout: timeout, signal: signal)
        raise "Copy inventory integrity failed." unless Digest::SHA256.hexdigest(bytes) == descriptor.fetch("sha256")

        JSON.parse(bytes.dup.force_encoding(Encoding::UTF_8))
      end
    end
  end
end
