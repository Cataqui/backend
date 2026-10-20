# frozen_string_literal: true

require "aws-sdk-s3"

module Cataqui
  module Mapshot
    class S3SourceImportStorageRepository
      def self.connect(account:, access:, secret:)
        new(client: Aws::S3::Client.new(
          region: "auto", endpoint: "https://#{account}.r2.cloudflarestorage.com",
          credentials: Aws::Credentials.new(access, secret),
          request_checksum_calculation: "when_required", response_checksum_validation: "when_required"
        ))
      end

      def initialize(client:)
        @_client = client
      end

      def get_object(input, &block)
        @_client.get_object(input, &block)
      end

      def put_object(input)
        @_client.put_object(input)
      end

      def head_object(input)
        @_client.head_object(input)
      end

      def create_multipart_upload(input)
        @_client.create_multipart_upload(input)
      end

      def upload_part(input)
        @_client.upload_part(input)
      end

      def upload_part_copy(input)
        @_client.upload_part_copy(input)
      end

      def complete_multipart_upload(input)
        @_client.complete_multipart_upload(input)
      end

      def abort_multipart_upload(input)
        @_client.abort_multipart_upload(input)
      end

      def list_objects_v2(input)
        @_client.list_objects_v2(input)
      end

      def delete_objects(input)
        @_client.delete_objects(input)
      end
    end
  end
end
