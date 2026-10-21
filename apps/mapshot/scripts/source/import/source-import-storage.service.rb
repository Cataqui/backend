# frozen_string_literal: true

require_relative "s3-source-import-storage.repository"
require "digest"
require "json"
require "uri"
require_relative "source-import.error"

module Cataqui
  module Mapshot
    # Owns source storage interpretation, bounded reads, and import checkpoints.
    class SourceImportStorageService
      DOCUMENT_BYTES = 4 * 1024 * 1024

      def self.from_environment(environment:, variables: ENV, domain: nil)
        account = variables["CLOUDFLARE_ACCOUNT_ID"]
        access = variables["MAPSHOT_R2_ACCESS_KEY_ID"]
        secret = variables["MAPSHOT_R2_SECRET_ACCESS_KEY"]
        unless %w[staging production].include?(environment) && account.is_a?(String) && account.match?(/\A[a-f0-9]{32}\z/) &&
            access.is_a?(String) && !access.empty? && secret.is_a?(String) && !secret.empty?
          raise SourceImportError.new(code: "INVALID_INPUT")
        end

        new(bucket: "cataqui-mapshot-#{environment}", domain: domain, repository: S3SourceImportStorageRepository.connect(
          account: account, access: access, secret: secret
        ))
      end

      def initialize(bucket:, repository:, domain: nil)
        @_bucket = bucket
        @_repository = repository
        @_domain = domain
      end

      def read_checkpoint(id:, signal: nil, timeout: 180)
        stored = read_document(key: "source/import/jobs/#{id}.json", maximum_bytes: DOCUMENT_BYTES,
                               signal: signal, timeout: timeout)
        return stored if stored.fetch("kind") == "missing"

        checkpoint = begin
  raise SourceImportError.new(code: "PREPARATION") if @_domain.nil?
  checked = @_domain.validate(kind: "import-checkpoint", value: stored.fetch("value"))
  unless checked.fetch("id") == id
    raise SourceImportError.new(code: "INTEGRITY")
  end
  checked
rescue SourceImportError => error
  raise unless error.code == "INVALID_INPUT"
  raise SourceImportError.new(code: "INTEGRITY"), cause: nil
end
        {"kind" => "checkpoint", "value" => checkpoint,
         "etag" => stored.fetch("etag")}
      end

      def write_checkpoint(id:, value:, expected_etag:, signal: nil, timeout: 180)
        write_document(key: "source/import/jobs/#{id}.json",
                       value: value, expected_etag: expected_etag,
                       signal: signal, timeout: timeout)
      end

      def read_range(key:, offset:, length:, etag:, signal: nil, timeout: 180)
        stored = _read(key: key, maximum_bytes: length, signal: signal, timeout: timeout,
                       range: {offset: offset, length: length, etag: etag})
        raise SourceImportError.new(code: "STORAGE") if stored.nil?

        stored.fetch("bytes")
      end

      def read_document(key:, maximum_bytes:, signal: nil, timeout: 180)
        stored = _read(key: key, maximum_bytes: maximum_bytes, signal: signal, timeout: timeout)
        return {"kind" => "missing"} if stored.nil?

        text = stored.fetch("bytes").force_encoding(Encoding::UTF_8)
        raise SourceImportError.new(code: "INTEGRITY") unless text.valid_encoding?

        {"kind" => "document", "etag" => stored.fetch("etag"), "value" => JSON.parse(text)}
      rescue JSON::ParserError
        raise SourceImportError.new(code: "INTEGRITY"), cause: nil
      end

      def write_document(key:, value:, expected_etag:, signal: nil, timeout: 180)
        begin
          bytes = JSON.generate(value).b
        rescue JSON::JSONError, EncodingError
          raise SourceImportError.new(code: "INVALID_INPUT"), cause: nil
        end
        raise SourceImportError.new(code: "INVALID_INPUT") if bytes.bytesize > DOCUMENT_BYTES

        input = {bucket: @_bucket, key: key, body: bytes, content_length: bytes.bytesize, content_type: "application/json"}
        input[expected_etag.nil? ? :if_none_match : :if_match] = expected_etag.nil? ? "*" : "\"#{expected_etag}\""
        response = _request(signal: signal, timeout: timeout) { @_repository.put_object(input) }
        {"kind" => "written", "etag" => _etag(response.etag)}
      rescue SourceImportError => error
        raise unless error.code == "CONFLICT"

        {"kind" => "conflict"}
      end

      def head_object(key:, signal: nil, timeout: 180)
        response = _request(signal: signal, timeout: timeout) do
          begin
            @_repository.head_object(bucket: @_bucket, key: key)
          rescue Aws::S3::Errors::ServiceError => error
            raise unless _missing?(error)

            nil
          end
        end
        return {"kind" => "missing"} if response.nil?
        unless _integer?(response.content_length) && response.content_length >= 0
          raise SourceImportError.new(code: "INTEGRITY")
        end

        {"kind" => "object", "etag" => _etag(response.etag), "bytes" => response.content_length,
         "sha256" => response.metadata&.fetch("sha256", nil), "contentType" => response.content_type}
      end

      def create_multipart(key:, signal: nil, timeout: 180)
        response = _request(signal: signal, timeout: timeout) { @_repository.create_multipart_upload(bucket: @_bucket, key: key) }
        unless response.upload_id.is_a?(String) && response.upload_id.length.between?(1, 1024) &&
            (response.key.nil? || response.key == key)
          raise SourceImportError.new(code: "INTEGRITY")
        end

        {"kind" => "multipart", "uploadId" => response.upload_id}
      end

      def write_part(key:, upload_id:, part_number:, bytes:, signal: nil, timeout: 180)
        response = _request(signal: signal, timeout: timeout) do
          @_repository.upload_part(bucket: @_bucket, key: key, upload_id: upload_id, part_number: part_number,
                                   body: bytes, content_length: bytes.bytesize)
        end
        _etag(response.etag)
      end

      # R2 supports bounded multipart copying, but not source If-Match on this operation.
      def copy_part(key:, source_bucket:, source_key:, upload_id:, part_number:, offset:, length:, signal: nil, timeout: 180)
        source = source_key.split("/").map { |segment| URI.encode_uri_component(segment) }.join("/")
        response = _request(signal: signal, timeout: timeout) do
          @_repository.upload_part_copy(bucket: @_bucket, key: key, upload_id: upload_id, part_number: part_number,
                                        copy_source: "#{source_bucket}/#{source}", copy_source_range: "bytes=#{offset}-#{offset + length - 1}")
        end
        _etag(response.copy_part_result&.etag)
      end

      def complete_multipart(key:, upload_id:, parts:, signal: nil, timeout: 180)
        response = _request(signal: signal, timeout: timeout) do
          @_repository.complete_multipart_upload(bucket: @_bucket, key: key, upload_id: upload_id,
                                                 multipart_upload: {parts: parts.map { |part| {part_number: part.fetch("partNumber"), etag: "\"#{part.fetch("etag")}\""} }})
        end
        etag = _etag(response.etag)
        stored = head_object(key: key, signal: signal, timeout: timeout)
        unless stored.fetch("kind") == "object" && stored.fetch("etag") == etag && (response.key.nil? || response.key == key)
          raise SourceImportError.new(code: "INTEGRITY")
        end

        {"kind" => "object", "etag" => etag, "bytes" => stored.fetch("bytes")}
      end

      def abort_multipart(key:, upload_id:, signal: nil, timeout: 180)
        _request(signal: signal, timeout: timeout) do
          begin
            @_repository.abort_multipart_upload(bucket: @_bucket, key: key, upload_id: upload_id)
          rescue Aws::S3::Errors::ServiceError => error
            # An ambiguous completion/abort may have already removed this upload.
            raise unless error.code == "NoSuchUpload" && error.context.http_response.status_code == 404
          end
        end
        {"kind" => "aborted"}
      end

      def put_raw(key:, bytes:, content_type:, signal: nil, timeout: 180)
        sha256 = Digest::SHA256.hexdigest(bytes)
        begin
          response = _request(signal: signal, timeout: timeout) do
            @_repository.put_object(bucket: @_bucket, key: key, body: bytes, content_length: bytes.bytesize,
                                    content_type: content_type, metadata: {"sha256" => sha256}, if_none_match: "*")
          end
          _etag(response.etag)
        rescue SourceImportError => error
          raise unless error.code == "CONFLICT"

          existing = head_object(key: key, signal: signal, timeout: timeout)
          unless existing.fetch("kind") == "object" && existing.fetch("bytes") == bytes.bytesize &&
              existing["sha256"] == sha256 && existing["contentType"] == content_type
            raise SourceImportError.new(code: "CONFLICT")
          end

          existing.fetch("etag")
        end
      end

      # One bounded page allows inventory consumers to checkpoint without retaining the prefix.
      def list_page(prefix:, cursor: nil, signal: nil, timeout: 180)
        input = {bucket: @_bucket, prefix: prefix, max_keys: 1000}
        input[:continuation_token] = cursor unless cursor.nil?
        response = _request(signal: signal, timeout: timeout) { @_repository.list_objects_v2(input) }
        contents = response.contents || []
        raise SourceImportError.new(code: "INTEGRITY") if contents.length > 1000

        objects = contents.map do |item|
          unless item.key.is_a?(String) && item.key.start_with?(prefix) && _integer?(item.size) && item.size >= 0
            raise SourceImportError.new(code: "INTEGRITY")
          end

          unless item.key.is_a?(String) && item.key.length.between?(1, 1024) &&
    item.key.match?(%r{\A(?:[A-Za-z0-9][A-Za-z0-9._-]*/)*[A-Za-z0-9][A-Za-z0-9._-]*\z})
            raise SourceImportError.new(code: "INTEGRITY")
          end
          {"key" => item.key, "etag" => _etag(item.etag), "bytes" => item.size}
        end
        return {"objects" => objects, "cursor" => nil} unless response.is_truncated

        token = response.next_continuation_token
        unless token.is_a?(String) && !token.empty? && token != cursor
          raise SourceImportError.new(code: "INTEGRITY")
        end

        {"objects" => objects, "cursor" => token}
      end

      def delete(keys:, signal: nil, timeout: 180)
        return nil if keys.empty?

        (signal || SourceImportSignal.new).with_timeout(seconds: timeout) do |bounded|
          keys.each_slice(1000) do |batch|
            response = _request(signal: bounded, timeout: timeout) do
              @_repository.delete_objects(bucket: @_bucket, delete: {objects: batch.map { |key| {key: key} }, quiet: true})
            end
            raise SourceImportError.new(code: "STORAGE") unless (response.errors || []).empty?
          end
        end
        nil
      end

      private

      def _integer?(value)
        value.is_a?(Integer) && value.abs <= (2**53) - 1
      end

      def _etag(value)
        token = value.is_a?(String) && value.start_with?('"') && value.end_with?('"') ? value[1...-1] : value
        unless token.is_a?(String) && token.match?(/\A[A-Za-z0-9][A-Za-z0-9._-]{0,255}\z/)
          raise SourceImportError.new(code: "INTEGRITY")
        end

        token
      end

      def _missing?(error)
        error.context.http_response.status_code == 404 || %w[NoSuchKey NotFound].include?(error.code)
      end

      def _read(key:, maximum_bytes:, signal:, timeout:, range: nil)
        bytes = +"".b
        _request(signal: signal, timeout: timeout) do |bounded|
          input = {bucket: @_bucket, key: key}
          unless range.nil?
            input[:range] = "bytes=#{range.fetch(:offset)}-#{range.fetch(:offset) + range.fetch(:length) - 1}"
            input[:if_match] = "\"#{range.fetch(:etag)}\""
          end
          begin
            response = @_repository.get_object(input) do |chunk, headers|
              bounded.check!
              length = _read_metadata(etag: headers["etag"], length: Integer(headers["content-length"], 10, exception: false),
                                      content_range: headers["content-range"], maximum_bytes: maximum_bytes, range: range)
              unless chunk.is_a?(String) && bytes.bytesize + chunk.bytesize <= length
                raise SourceImportError.new(code: "INTEGRITY")
              end

              bytes << chunk.b
            end
            bounded.check!
            length = _read_metadata(etag: response.etag, length: response.content_length,
                                    content_range: response.content_range, maximum_bytes: maximum_bytes, range: range)
            raise SourceImportError.new(code: "INTEGRITY") unless bytes.bytesize == length

            {"etag" => _etag(response.etag), "bytes" => bytes}
          rescue Aws::S3::Errors::ServiceError => error
            raise unless _missing?(error)

            nil
          end
        end
      end

      def _read_metadata(etag:, length:, content_range:, maximum_bytes:, range:)
        token = _etag(etag)
        unless _integer?(length) && length.between?(1, maximum_bytes)
          raise SourceImportError.new(code: "INTEGRITY")
        end
        return length if range.nil?

        finish = range.fetch(:offset) + range.fetch(:length)
        match = /\Abytes #{range.fetch(:offset)}-#{finish - 1}\/([0-9]+)\z/.match(content_range || "")
        total = match && Integer(match[1], 10)
        unless token == range.fetch(:etag) && length == range.fetch(:length) && _integer?(total) && total >= finish
          raise SourceImportError.new(code: "INTEGRITY")
        end

        length
      end

      def _request(signal:, timeout:)
        bounded = signal || SourceImportSignal.new
        bounded.with_timeout(seconds: timeout) do |request_signal|
          request_signal.check!
          result = yield(request_signal)
          request_signal.check!
          result
        end
      rescue SourceImportError
        raise
      rescue StandardError => error
        # The SDK wraps exceptions raised by a streaming callback. Preserve our
        # own integrity/cancellation outcome through its ordinary cause chain.
        failure = error.cause
        until failure.nil?
          raise failure if failure.is_a?(SourceImportError)

          failure = failure.cause
        end
        code = if bounded.aborted?
                 "ABORTED"
               elsif error.is_a?(Aws::S3::Errors::ServiceError) && [409, 412].include?(error.context.http_response.status_code)
                 "CONFLICT"
               else
                 "STORAGE"
               end
        raise SourceImportError.new(code: code), cause: nil
      end
    end
  end
end
