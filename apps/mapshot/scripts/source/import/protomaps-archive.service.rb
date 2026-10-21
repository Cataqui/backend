# frozen_string_literal: true

require_relative "source-import.error"
require_relative "protomaps-archive.repository"

module Cataqui
  module Mapshot
    class ProtomapsArchiveService
      def initialize(repository: ProtomapsArchiveRepository.new)
        @_repository = repository
      end

      def read(archive:, offset:, length:, etag: nil, signal: nil)
        parent = signal || SourceImportSignal.new
        parent.with_timeout(seconds: 180) do |bounded|
          bounded.check!
          result = nil
          @_repository.read(key: archive.fetch("key"), offset: offset, length: length, etag: etag, timeout: 180) do |response|
            bounded.check!
            actual_etag = response["etag"]
            unless response.code == "206" && response["content-range"] == "bytes #{offset}-#{offset + length - 1}/#{archive.fetch("bytes")}" &&
                response["content-length"] == length.to_s && actual_etag.is_a?(String) && !actual_etag.empty? &&
                !actual_etag.start_with?("W/") && (etag.nil? || etag == actual_etag) &&
                [nil, "identity"].include?(response["content-encoding"])
              raise SourceImportError.new(code: "INTEGRITY")
            end

            bytes = +"".b
            response.read_body do |chunk|
              bounded.check!
              unless chunk.is_a?(String) && bytes.bytesize + chunk.bytesize <= length
                raise SourceImportError.new(code: "INTEGRITY")
              end

              bytes << chunk.b
            end
            bounded.check!
            raise SourceImportError.new(code: "INTEGRITY") unless bytes.bytesize == length

            result = {"bytes" => bytes, "etag" => actual_etag}
          end
          raise SourceImportError.new(code: "SOURCE") if result.nil?

          result
        end
      rescue SourceImportError
        raise
      rescue StandardError
        raise SourceImportError.new(code: parent.aborted? ? "ABORTED" : "SOURCE"), cause: nil
      end
    end
  end
end
