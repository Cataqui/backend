# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "source-import-storage.service"

class MapshotSourceImportStorageServiceTest < Minitest::Test
  ID = "a" * 64
  KEY = "source/import/attempts/#{ID}/0/archive.pmtiles".freeze

  class Domain
    attr_accessor :error
    attr_reader :validated

    def initialize
      @validated = []
    end

    def validate(kind:, value:)
      raise error if error

      @validated.push([kind, value])
      value
    end

  end

  def setup
    @_repository = Aws::S3::Client.new(region: "auto", credentials: Aws::Credentials.new("test", "test"), stub_responses: true,
      request_checksum_calculation: "when_required", response_checksum_validation: "when_required")
    @_domain = Domain.new
    @_service = Cataqui::Mapshot::SourceImportStorageService.new(bucket: "private-map-data", repository: @_repository, domain: @_domain)
    @_signal = Cataqui::Mapshot::SourceImportSignal.new
  end

  def test_configures_the_supported_r2_sdk_without_eager_provider_calls
    variables = {"CLOUDFLARE_ACCOUNT_ID" => "a" * 32, "MAPSHOT_R2_ACCESS_KEY_ID" => "access", "MAPSHOT_R2_SECRET_ACCESS_KEY" => "private"}
    service = Cataqui::Mapshot::SourceImportStorageService.from_environment(environment: "staging", variables: variables)
    assert_instance_of Cataqui::Mapshot::SourceImportStorageService, service
    [%w[unknown staging], %w[staging bad]].each do |environment, account|
      _assert_code("INVALID_INPUT") do
        Cataqui::Mapshot::SourceImportStorageService.from_environment(environment: environment,
          variables: variables.merge("CLOUDFLARE_ACCOUNT_ID" => account))
      end
    end
    %w[MAPSHOT_R2_ACCESS_KEY_ID MAPSHOT_R2_SECRET_ACCESS_KEY].each do |key|
      _assert_code("INVALID_INPUT") do
        Cataqui::Mapshot::SourceImportStorageService.from_environment(environment: "production", variables: variables.merge(key => ""))
      end
    end
  end

  def test_returns_narrow_head_metadata_and_supports_empty_objects
    @_repository.stub_responses(:head_object, {etag: '"object-etag"', content_length: 0, metadata: {"sha256" => "hash"}, content_type: "application/json"})
    assert_equal({"kind" => "object", "etag" => "object-etag", "bytes" => 0, "sha256" => "hash", "contentType" => "application/json"},
      @_service.head_object(key: KEY, signal: @_signal, timeout: 15))
    assert_equal({bucket: "private-map-data", key: KEY}, _params(:head_object))
  end

  def test_sanitizes_storage_failures_and_preserves_owned_failures
    [RuntimeError.new("private token"), _provider_error(status: 500)].each do |error|
      @_repository.stub_responses(:head_object, error)
      _assert_code("STORAGE") { @_service.head_object(key: KEY) }
    end
    @_repository.stub_responses(:head_object, Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY"))
    _assert_code("INTEGRITY") { @_service.head_object(key: KEY) }
  end

  def test_aborts_before_provider_request_and_interrupts_an_unresponsive_call
    @_signal.abort!
    _assert_code("ABORTED") { @_service.head_object(key: KEY, signal: @_signal) }
    assert_empty @_repository.api_requests
    @_repository.stub_responses(:head_object, ->(_context) { sleep 5 })
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    _assert_code("ABORTED") { @_service.head_object(key: KEY, timeout: 0.01) }
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - start, :<, 1
  end

  def test_maps_simultaneous_abort_and_transport_failure_to_aborted
    @_repository.stub_responses(:head_object, ->(_context) { @_signal.abort!; raise IOError, "private" })
    _assert_code("ABORTED") { @_service.head_object(key: KEY, signal: @_signal) }
  end

  def test_recognizes_only_sdk_missing_responses_as_absent_objects
    [404, 403].each do |status|
      @_repository.stub_responses(:head_object, _provider_error(status: status, name: "NoSuchKey"))
      assert_equal({"kind" => "missing"}, @_service.head_object(key: KEY))
    end
    @_repository.stub_responses(:get_object, _provider_error(status: 404))
    assert_equal({"kind" => "missing"}, @_service.read_document(key: KEY, maximum_bytes: 100))
    _assert_code("STORAGE") { @_service.read_range(key: KEY, offset: 0, length: 1, etag: "etag") }
  end

  def test_rejects_invalid_head_metadata_and_etags
    [{content_length: -1, etag: "etag"}, {content_length: 1, etag: nil},
      {content_length: 1, etag: "invalid etag"}, {content_length: 1, etag: '"invalid'}].each do |metadata|
      @_repository.stub_responses(:head_object, metadata)
      _assert_code("INTEGRITY") { @_service.head_object(key: KEY) }
    end
  end

  def test_streams_an_exact_conditional_range_with_canonical_sdk_inputs
    _range_response
    assert_equal "ab", @_service.read_range(key: KEY, offset: 4, length: 2, etag: "object-etag")
    assert_equal({bucket: "private-map-data", key: KEY, range: "bytes=4-5", if_match: '"object-etag"'}, _params(:get_object))
  end

  def test_rejects_inconsistent_range_headers_before_retaining_chunks
    [{etag: "different"}, {content_length: 3}, {content_range: "invalid"}, {content_range: "bytes 4-5/5"},
      {content_range: "bytes 4-5/#{2**60}"}, {content_range: nil}, {etag: nil}].each do |change|
      _range_response(**change)
      _assert_code("INTEGRITY") { @_service.read_range(key: KEY, offset: 4, length: 2, etag: "object-etag") }
    end
  end

  def test_rejects_incomplete_or_oversized_streams_and_precondition_changes
    ["", "a", "abc"].each do |body|
      _range_response(body: body)
      _assert_code("INTEGRITY") { @_service.read_range(key: KEY, offset: 4, length: 2, etag: "object-etag") }
    end
    @_repository.stub_responses(:get_object, _provider_error(status: 412))
    _assert_code("CONFLICT") { @_service.read_range(key: KEY, offset: 4, length: 2, etag: "object-etag") }
  end

  def test_reads_bounded_utf8_json_documents
    @_repository.stub_responses(:get_object, {body: '{"ok":true}', etag: "document-etag", content_length: 11})
    assert_equal({"kind" => "document", "etag" => "document-etag", "value" => {"ok" => true}},
      @_service.read_document(key: KEY, maximum_bytes: 100))
    assert_equal({bucket: "private-map-data", key: KEY}, _params(:get_object))
  end

  def test_rejects_invalid_document_json_encoding_and_returned_size
    [["not json", 8], ["\xff".b, 1], ["{}", 1], ["", 0]].each do |body, length|
      @_repository.stub_responses(:get_object, {body: body, etag: "etag", content_length: length})
      _assert_code("INTEGRITY") { @_service.read_document(key: KEY, maximum_bytes: 100) }
    end
    @_repository.stub_responses(:get_object, {body: "{}", etag: "etag", content_length: 2})
    _assert_code("INTEGRITY") { @_service.read_document(key: KEY, maximum_bytes: 1) }
  end

  def test_writes_json_with_native_creation_and_compare_and_swap_conditions
    @_repository.stub_responses(:put_object, {etag: '"written"'})
    assert_equal({"kind" => "written", "etag" => "written"},
      @_service.write_document(key: KEY, value: {"ok" => true}, expected_etag: nil))
    assert_equal({bucket: "private-map-data", key: KEY, body: '{"ok":true}', content_length: 11,
      content_type: "application/json", if_none_match: "*"}, _params(:put_object))
    @_service.write_document(key: KEY, value: {}, expected_etag: "previous")
    assert_equal '"previous"', _params(:put_object).fetch(:if_match)
    [409, 412].each do |status|
      @_repository.stub_responses(:put_object, _provider_error(status: status))
      assert_equal({"kind" => "conflict"}, @_service.write_document(key: KEY, value: {}, expected_etag: nil))
    end
    @_repository.stub_responses(:put_object, RuntimeError.new("private"))
    _assert_code("STORAGE") { @_service.write_document(key: KEY, value: {}, expected_etag: nil) }
  end

  def test_rejects_cyclic_and_oversized_json_without_provider_calls
    cyclic = {}
    cyclic["self"] = cyclic
    [cyclic, {"huge" => "a" * (4 * 1024 * 1024)}].each do |value|
      _assert_code("INVALID_INPUT") { @_service.write_document(key: KEY, value: value, expected_etag: nil) }
    end
    assert_empty @_repository.api_requests
  end

  def test_validates_checkpoint_schema_and_requested_job_identity_through_domain_library
    checkpoint = {"id" => ID, "input" => {"id" => ID}}
    bytes = JSON.generate(checkpoint)
    @_repository.stub_responses(:get_object, {body: bytes, etag: "checkpoint", content_length: bytes.bytesize})
    assert_equal({"kind" => "checkpoint", "value" => checkpoint, "etag" => "checkpoint"}, @_service.read_checkpoint(id: ID))
    assert_equal "source/import/jobs/#{ID}.json", _params(:get_object).fetch(:key)
    assert_equal "import-checkpoint", @_domain.validated.last.first
    @_repository.stub_responses(:put_object, {etag: "written"})
    assert_equal({"kind" => "written", "etag" => "written"},
      @_service.write_checkpoint(id: ID, value: checkpoint, expected_etag: "checkpoint"))
    mismatched = JSON.generate(checkpoint.merge("id" => "b" * 64))
    @_repository.stub_responses(:get_object, {body: mismatched, etag: "checkpoint", content_length: mismatched.bytesize})
    _assert_code("INTEGRITY") { @_service.read_checkpoint(id: ID) }
    @_domain.error = Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY")
    _assert_code("INTEGRITY") { @_service.read_checkpoint(id: ID) }
    @_domain.error = Cataqui::Mapshot::SourceImportError.new(code: "INVALID_INPUT")
    _assert_code("INTEGRITY") { @_service.read_checkpoint(id: ID) }
    _assert_code("PREPARATION") do
      Cataqui::Mapshot::SourceImportStorageService.new(bucket: "private-map-data", repository: @_repository)
        .read_checkpoint(id: ID)
    end
    @_repository.stub_responses(:get_object, _provider_error(status: 404))
    assert_equal({"kind" => "missing"}, @_service.read_checkpoint(id: ID))
  end

  def test_owned_checkpoint_updates_do_not_fork_domain_validation_for_each_upload_part
    @_domain.error = Cataqui::Mapshot::SourceImportError.new(code: "PREPARATION")
    @_repository.stub_responses(:put_object, {etag: "written"})
    checkpoint = {"id" => ID, "stage" => "uploading", "parts" => [{"partNumber" => 1, "etag" => "part"}]}
    assert_equal({"kind" => "written", "etag" => "written"},
      @_service.write_checkpoint(id: ID, value: checkpoint, expected_etag: "previous"))
    assert_empty @_domain.validated
    assert_equal '"previous"', _params(:put_object).fetch(:if_match)
    assert_equal checkpoint, JSON.parse(_params(:put_object).fetch(:body))
    _assert_code("INVALID_INPUT") do
      @_service.write_checkpoint(id: ID, value: {"id" => ID, "huge" => "a" * (4 * 1024 * 1024)}, expected_etag: nil)
    end
  end

  def test_creates_uploads_and_rejects_missing_or_wrong_upload_receipts
    @_repository.stub_responses(:create_multipart_upload, {upload_id: "upload", key: KEY})
    assert_equal({"kind" => "multipart", "uploadId" => "upload"}, @_service.create_multipart(key: KEY))
    assert_equal({bucket: "private-map-data", key: KEY}, _params(:create_multipart_upload))
    [{upload_id: nil}, {upload_id: ""}, {upload_id: "u" * 1025}, {upload_id: "upload", key: "other"}].each do |receipt|
      @_repository.stub_responses(:create_multipart_upload, receipt)
      _assert_code("INTEGRITY") { @_service.create_multipart(key: KEY) }
    end
  end

  def test_uploads_the_producers_part_through_the_repository
    @_repository.stub_responses(:upload_part, {etag: '"part"'})
    assert_equal "part", @_service.write_part(key: KEY, upload_id: "upload", part_number: 1, bytes: "data")
    assert_equal({bucket: "private-map-data", key: KEY, upload_id: "upload", part_number: 1, body: "data", content_length: 4}, _params(:upload_part))
  end

  def test_copies_a_bounded_range_between_buckets_using_supported_r2_arguments
    @_repository.stub_responses(:upload_part_copy, {copy_part_result: {etag: '"copied"'}})
    input = {key: KEY, source_bucket: "staging", source_key: "source/a b+?.pmtiles", upload_id: "upload", part_number: 2, offset: 64, length: 2}
    assert_equal "copied", @_service.copy_part(**input)
    assert_equal({bucket: "private-map-data", key: KEY, upload_id: "upload", part_number: 2,
      copy_source: "staging/source/a%20b%2B%3F.pmtiles", copy_source_range: "bytes=64-65"}, _params(:upload_part_copy))
    @_repository.stub_responses(:upload_part_copy, {copy_part_result: {etag: nil}})
    _assert_code("INTEGRITY") { @_service.copy_part(**input) }
  end

  def test_completes_the_producers_parts_and_verifies_the_stored_object
    @_repository.stub_responses(:complete_multipart_upload, {etag: "complete", key: KEY})
    @_repository.stub_responses(:head_object, {etag: '"complete"', content_length: 127})
    input = {key: KEY, upload_id: "upload", parts: [{"partNumber" => 1, "etag" => "part"}]}
    assert_equal({"kind" => "object", "etag" => "complete", "bytes" => 127}, @_service.complete_multipart(**input))
    assert_equal({bucket: "private-map-data", key: KEY, upload_id: "upload",
      multipart_upload: {parts: [{part_number: 1, etag: '"part"'}]}}, _params(:complete_multipart_upload))
    @_repository.stub_responses(:complete_multipart_upload, {etag: "complete", key: "wrong"})
    _assert_code("INTEGRITY") { @_service.complete_multipart(**input) }
    @_repository.stub_responses(:complete_multipart_upload, {etag: "complete"})
    @_repository.stub_responses(:head_object, {etag: "wrong", content_length: 127})
    _assert_code("INTEGRITY") { @_service.complete_multipart(**input) }
    @_repository.stub_responses(:head_object, _provider_error(status: 404))
    _assert_code("INTEGRITY") { @_service.complete_multipart(**input) }
  end

  def test_aborts_exact_upload_and_accepts_only_the_exact_already_absent_upload_error
    @_repository.stub_responses(:abort_multipart_upload, {})
    assert_equal({"kind" => "aborted"}, @_service.abort_multipart(key: KEY, upload_id: "upload"))
    assert_equal({bucket: "private-map-data", key: KEY, upload_id: "upload"}, _params(:abort_multipart_upload))
    @_repository.stub_responses(:abort_multipart_upload, _provider_error(status: 404, name: "NoSuchUpload"))
    assert_equal({"kind" => "aborted"}, @_service.abort_multipart(key: KEY, upload_id: "upload"))
    [[404, "ProviderFailure"], [404, "NoSuchBucket"], [403, "NoSuchUpload"]].each do |status, name|
      @_repository.stub_responses(:abort_multipart_upload, _provider_error(status: status, name: name))
      _assert_code("STORAGE") { @_service.abort_multipart(key: KEY, upload_id: "upload") }
    end
  end

  def test_writes_immutable_objects_with_content_hash_and_reuses_only_identical_existing_bytes
    @_repository.stub_responses(:put_object, {etag: "written"})
    assert_equal "written", @_service.put_raw(key: KEY, bytes: "data", content_type: "application/json")
    assert_equal({bucket: "private-map-data", key: KEY, body: "data", content_length: 4, content_type: "application/json",
      metadata: {"sha256" => Digest::SHA256.hexdigest("data")}, if_none_match: "*"}, _params(:put_object))
    @_repository.stub_responses(:put_object, _provider_error(status: 412))
    @_repository.stub_responses(:head_object, {etag: "existing", content_length: 4,
      metadata: {"sha256" => Digest::SHA256.hexdigest("data")}, content_type: "application/json"})
    assert_equal "existing", @_service.put_raw(key: KEY, bytes: "data", content_type: "application/json")
  end

  def test_refuses_conflicting_immutable_objects_and_sanitizes_ordinary_write_failure
    @_repository.stub_responses(:put_object, _provider_error(status: 409))
    [{content_length: 5}, {metadata: {"sha256" => "wrong"}}, {content_type: "other"}].each do |change|
      @_repository.stub_responses(:head_object, {etag: "existing", content_length: 4,
        metadata: {"sha256" => Digest::SHA256.hexdigest("data")}, content_type: "application/json"}.merge(change))
      _assert_code("CONFLICT") { @_service.put_raw(key: KEY, bytes: "data", content_type: "application/json") }
    end
    @_repository.stub_responses(:head_object, _provider_error(status: 404))
    _assert_code("CONFLICT") { @_service.put_raw(key: KEY, bytes: "data", content_type: "application/json") }
    @_repository.stub_responses(:put_object, RuntimeError.new("private"))
    _assert_code("STORAGE") { @_service.put_raw(key: KEY, bytes: "data", content_type: "application/json") }
  end

  def test_lists_one_bounded_page_with_a_resumable_cursor
    @_repository.stub_responses(:list_objects_v2, {contents: [{key: "source/one.json", etag: '"etag"', size: 12}], is_truncated: true, next_continuation_token: "next"})
    assert_equal({"objects" => [{"key" => "source/one.json", "etag" => "etag", "bytes" => 12}], "cursor" => "next"},
      @_service.list_page(prefix: "source/"))
    assert_equal({bucket: "private-map-data", prefix: "source/", max_keys: 1000}, _params(:list_objects_v2))
    @_repository.stub_responses(:list_objects_v2, {is_truncated: false})
    assert_equal({"objects" => [], "cursor" => nil}, @_service.list_page(prefix: "source/", cursor: "checkpoint"))
    assert_equal "checkpoint", _params(:list_objects_v2).fetch(:continuation_token)
    @_repository.stub_responses(:list_objects_v2, {contents: Array.new(1000) { |index| {key: "source/#{index}", etag: "etag", size: 1} }})
    assert_equal 1000, @_service.list_page(prefix: "source/").fetch("objects").length
  end

  def test_rejects_unbounded_or_nonadvancing_pages_and_malformed_inventory
    [nil, "", "checkpoint"].each do |cursor|
      @_repository.stub_responses(:list_objects_v2, {is_truncated: true, next_continuation_token: cursor})
      _assert_code("INTEGRITY") { @_service.list_page(prefix: "source/", cursor: "checkpoint") }
    end
    @_repository.stub_responses(:list_objects_v2, {contents: Array.new(1001) { |index| {key: "source/#{index}", etag: "etag", size: 1} }})
    _assert_code("INTEGRITY") { @_service.list_page(prefix: "source/") }
    [{key: nil}, {key: "other/file"}, {size: -1}].each do |change|
      @_repository.stub_responses(:list_objects_v2, {contents: [{key: "source/file", size: 1, etag: "etag"}.merge(change)]})
      _assert_code("INTEGRITY") { @_service.list_page(prefix: "source/") }
    end
  end

  def test_classifies_a_provider_listed_noncanonical_key_as_an_integrity_failure
    @_repository.stub_responses(:list_objects_v2, {contents: [{key: "source/../file", size: 1, etag: "etag"}]})

    _assert_code("INTEGRITY") { @_service.list_page(prefix: "source/") }
  end

  def test_deletes_selected_keys_in_thousand_object_batches
    keys = Array.new(1001) { |index| "source/objects/#{index}.json" }
    @_repository.stub_responses(:delete_objects, {errors: []})
    assert_nil @_service.delete(keys: keys)
    requests = @_repository.api_requests.select { |request| request.fetch(:operation_name) == :delete_objects }
    assert_equal([1000, 1], requests.map { |request| request.fetch(:params).fetch(:delete).fetch(:objects).length })
    assert_equal [{key: keys.last}], requests.last.fetch(:params).fetch(:delete).fetch(:objects)
    count = @_repository.api_requests.length
    assert_nil @_service.delete(keys: [])
    assert_equal count, @_repository.api_requests.length
    @_repository.stub_responses(:delete_objects, {errors: [{key: KEY, code: "AccessDenied", message: "private"}]})
    _assert_code("STORAGE") { @_service.delete(keys: [KEY]) }
  end

def test_preserves_owned_integrity_when_the_repository_wraps_a_stream_callback_failure
  failure = Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY")
  @_repository.stub_responses(:get_object, ->(_context) { raise IOError, "wrapped provider callback", cause: failure })
  _assert_code("INTEGRITY") { @_service.read_document(key: KEY, maximum_bytes: 1) }
end

def test_checks_cancellation_when_a_stream_callback_arrives
  @_repository.stub_responses(:get_object, {body: "{}", etag: "etag", content_length: 2})
  checks = 0
  original = @_signal.method(:with_timeout)
  @_signal.define_singleton_method(:with_timeout) do |seconds:, &operation|
    original.call(seconds: seconds) do |bounded|
      original_check = bounded.method(:check!)
      bounded.define_singleton_method(:check!) do
        checks += 1
        abort! if checks == 3
        original_check.call
      end
      operation.call(bounded)
    end
  end
  _assert_code("ABORTED") { @_service.read_document(key: KEY, maximum_bytes: 10, signal: @_signal) }
end

private

  def _range_response(**changes)
    @_repository.stub_responses(:get_object, {body: "ab", etag: '"object-etag"', content_length: 2, content_range: "bytes 4-5/100"}.merge(changes))
  end

  def _params(operation)
    @_repository.api_requests.reverse.find { |request| request.fetch(:operation_name) == operation }.fetch(:params)
  end

  def _provider_error(status:, name: "ProviderFailure")
    context = Seahorse::Client::RequestContext.new
    context.http_response.status_code = status
    error_class = Aws::S3::Errors.const_get(name)
    error_class.code = name
    error_class.new(context, "private credentials and provider diagnostics")
  end

  def _assert_code(code)
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { yield }
    assert_equal code, error.code
    assert_equal "The source import did not complete.", error.message
  end
end
