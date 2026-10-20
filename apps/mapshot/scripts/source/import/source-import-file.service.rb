# frozen_string_literal: true

require_relative "source-import.error"
require_relative "source-import-file.repository"

module Cataqui
  module Mapshot
    # The S3 SDK supplies multipart operations; the service coordinates the
    # producer's completed index and cleans up incomplete uploads.
    class SourceImportFileService
      def initialize(storage:, repository: SourceImportFileRepository.new)
        @_storage = storage
        @_repository = repository
      end

      def upload(path:, index:, signal:)
        @_repository.open(path: path) do |file|
          upload_id = nil
          begin
            upload = @_storage.create_multipart(key: index.fetch("key"), signal: signal)
            upload_id = upload.fetch("uploadId")
            parts = []
            remaining = index.fetch("bytes")
            while remaining.positive?
              signal.check!
              expected = [64 * 1024 * 1024, remaining].min
              bytes = @_repository.read_part(file: file, length: expected)
              raise SourceImportError.new(code: "INTEGRITY") unless bytes && bytes.bytesize == expected

              part_number = parts.length + 1
              etag = @_storage.write_part(
                key: index.fetch("key"), upload_id: upload_id, part_number: part_number,
                bytes: bytes, signal: signal
              )
              parts.push({"partNumber" => part_number, "etag" => etag})
              remaining -= expected
            end
            complete = @_storage.complete_multipart(
              key: index.fetch("key"), upload_id: upload_id, parts: parts, signal: signal
            )
            raise SourceImportError.new(code: "INTEGRITY") unless complete.fetch("bytes") == index.fetch("bytes")

            upload_id = nil
          ensure
            if upload_id
              SourceImportSignal.new.with_timeout(seconds: 15) do |cleanup_signal|
                @_storage.abort_multipart(key: index.fetch("key"), upload_id: upload_id, signal: cleanup_signal)
              end
            end
          end
        end
        nil
      end
    end
  end
end
