# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "s3-source-import-storage.repository"

class MapshotS3SourceImportStorageRepositoryTest < Minitest::Test
  def test_configures_the_supported_r2_sdk_without_eager_provider_calls
    repository = Cataqui::Mapshot::S3SourceImportStorageRepository.connect(account: "a" * 32, access: "access", secret: "private")
    assert_instance_of Cataqui::Mapshot::S3SourceImportStorageRepository, repository
  end

  def test_forwards_each_operation_and_returns_the_exact_provider_result
    %i[get_object put_object head_object create_multipart_upload upload_part upload_part_copy
      complete_multipart_upload abort_multipart_upload list_objects_v2 delete_objects].each do |operation|
      response = Object.new
      input = {bucket: "private-map-data", key: "source/object"}
      received = []
      client = Object.new
      client.define_singleton_method(operation) do |argument|
        received.push(argument)
        response
      end
      repository = Cataqui::Mapshot::S3SourceImportStorageRepository.new(client: client)
      assert_same response, repository.public_send(operation, input)
      assert_equal [input], received
    end
  end

  def test_returns_uninterpreted_missing_metadata_and_preserves_provider_failure_identity
    response = Aws::S3::Types::HeadObjectOutput.new(content_length: -1, etag: nil)
    failure = IOError.new("provider request failed")
    client = Object.new
    client.define_singleton_method(:head_object) { |_input| response }
    client.define_singleton_method(:put_object) { |_input| raise failure }
    repository = Cataqui::Mapshot::S3SourceImportStorageRepository.new(client: client)
    assert_same response, repository.head_object(bucket: "private-map-data", key: "source/object")
    assert_same failure, assert_raises(IOError) { repository.put_object(bucket: "private-map-data", key: "source/object") }
  end

  def test_forwards_stream_chunks_and_preserves_callback_failures
    response = Object.new
    client = Object.new
    client.define_singleton_method(:get_object) do |_input, &block|
      block.call("bytes", {"etag" => "etag"})
      response
    end
    repository = Cataqui::Mapshot::S3SourceImportStorageRepository.new(client: client)
    chunks = []
    assert_same response, repository.get_object(bucket: "private-map-data", key: "source/object") { |*chunk| chunks.push(chunk) }
    assert_equal [["bytes", {"etag" => "etag"}]], chunks
    failure = IOError.new("consumer stopped")
    raised = assert_raises(IOError) do
      repository.get_object(bucket: "private-map-data", key: "source/object") { raise failure }
    end
    assert_same failure, raised
  end
end
