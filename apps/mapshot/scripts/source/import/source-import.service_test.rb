# frozen_string_literal: true

require_relative "../../../test/test_helper"
require "digest"
require "fileutils"
require "json"
require "tmpdir"
require "timeout"
require_relative "source-import.service"

class MapshotSourceImportServiceTest < Minitest::Test
  PART_BYTES = 64 * 1024 * 1024

  class Boundary
    def initialize
      @_calls = Hash.new { |values, key| values[key] = [] }
      @_hooks = {}
    end

    def calls(name)
      @_calls[name]
    end

    def on(name, &block)
      @_hooks[name] = block
    end

    private

    def _invoke(name, params, recorded: params)
      @_calls[name].push(recorded)
      params[:signal]&.check!
      @_hooks[name]&.call(params)
    end

    def _copy(value)
      Marshal.load(Marshal.dump(value))
    end
  end

  class Storage < Boundary
    def initialize
      super
      @_checkpoint = nil
      @_etag = 0
      @_objects = {}
      @_multipart = {}
    end

    def checkpoint
      @_checkpoint
    end

    def install(value)
      @_checkpoint = _copy(value)
      @_etag += 1
    end

    def objects
      @_objects
    end

    def read_checkpoint(**params)
      override = _invoke(:read_checkpoint, params)
      return override unless override.nil?
      return {"kind" => "missing"} if @_checkpoint.nil? || @_checkpoint.fetch("id") != params.fetch(:id)

      {"kind" => "checkpoint", "etag" => "checkpoint-#{@_etag}", "value" => _copy(@_checkpoint)}
    end

    def write_checkpoint(**params)
      recorded = params.merge(value: _copy(params.fetch(:value)))
      override = _invoke(:write_checkpoint, params, recorded: recorded)
      return override unless override.nil?
      return {"kind" => "conflict"} unless params.fetch(:expected_etag) == (@_checkpoint.nil? ? nil : "checkpoint-#{@_etag}")

      install(params.fetch(:value))
      {"kind" => "written", "etag" => "checkpoint-#{@_etag}"}
    end

    def create_multipart(**params)
      override = _invoke(:create_multipart, params)
      return override unless override.nil?

      upload_id = "upload-#{calls(:create_multipart).length}"
      @_multipart[upload_id] = {}
      {"kind" => "multipart", "uploadId" => upload_id}
    end

    def write_part(**params)
      recorded = params.except(:bytes).merge(bytes: params.fetch(:bytes).bytesize, bytes_id: params.fetch(:bytes).object_id)
      override = _invoke(:write_part, params, recorded: recorded)
      return override unless override.nil?

      @_multipart.fetch(params.fetch(:upload_id))[params.fetch(:part_number)] = params.fetch(:bytes).bytesize
      "part-#{params.fetch(:part_number)}"
    end

    def complete_multipart(**params)
      override = _invoke(:complete_multipart, params)
      return override unless override.nil?

      bytes = params.fetch(:parts).sum { |part| @_multipart.fetch(params.fetch(:upload_id)).fetch(part.fetch("partNumber")) }
      @_objects[params.fetch(:key)] = {"kind" => "object", "etag" => "archive", "bytes" => bytes}
    end

    def abort_multipart(**params)
      override = _invoke(:abort_multipart, params)
      return override unless override.nil?

      @_multipart.delete(params.fetch(:upload_id))
      {"kind" => "aborted"}
    end

    def head_object(**params)
      override = _invoke(:head_object, params)
      return override unless override.nil?

      @_objects.fetch(params.fetch(:key), {"kind" => "missing"})
    end

    def put_raw(**params)
      override = _invoke(:put_raw, params)
      return override unless override.nil?

      @_objects[params.fetch(:key)] = {"kind" => "object", "etag" => "prepared", "bytes" => params.fetch(:bytes).bytesize}
      "prepared"
    end
  end

  class Archives < Boundary
    def read(**params)
      override = _invoke(:read, params)
      return override unless override.nil?

      {"bytes" => "\0".b * params.fetch(:length), "etag" => '"origin"'}
    end
  end

  class Domain < Boundary
    def validate(**params)
      override = _invoke(:validate, params)
      return override unless override.nil?
      raise ArgumentError, "Unknown domain validation kind." unless %w[import-job import-checkpoint source-release].include?(params.fetch(:kind))

      _copy(params.fetch(:value))
    end

    def verify_archive_and_extract_landmarks(**params)
      override = _invoke(:verify_archive_and_extract_landmarks, params)
      return override unless override.nil?

      checkpoint = params.fetch(:checkpoint)
      input = checkpoint.fetch("input")
      archive = input.fetch("archive")
      path = File.join(params.fetch(:work_directory), "landmarks.pmtiles")
      File.binwrite(path, "landmarks")
      {
        "archive" => {
          "id" => archive.fetch("blake3"), "objectKey" => checkpoint.dig("verifiedArchive", "objectKey") || checkpoint.fetch("objectKey"),
          "bytes" => archive.fetch("bytes"), "etag" => checkpoint.fetch("objectEtag"),
          "digest" => {"algorithm" => "blake3", "value" => archive.fetch("blake3"), "verified" => true},
          "minZoom" => 0, "maxZoom" => 15, "coverage" => "complete-planet"
        },
        "landmarks" => {
          "path" => path, "bytes" => 9, "sha256" => Digest::SHA256.hexdigest("landmarks"),
          "archiveId" => archive.fetch("blake3")
        }
      }
    end

    def prepare_indexes(**params)
      override = _invoke(:prepare_indexes, params)
      return override unless override.nil?

      path = File.join(params.fetch(:work_directory), "manifest.json")
      File.binwrite(path, "{}")
      key = "source/indexes/v1/#{params.fetch(:release).dig("pmtiles", "id")}/#{"e" * 64}/manifest.json"
      {
        "reference" => {"manifestKey" => key, "sha256" => "e" * 64, "bytes" => 2,
                        "archiveId" => params.fetch(:release).dig("pmtiles", "id")},
        "files" => [{"key" => key, "path" => path, "contentType" => "application/json",
                     "sha256" => Digest::SHA256.hexdigest("{}"), "bytes" => 2}]
      }
    end
  end

  class Files < Boundary
    def initialize(storage:)
      super()
      @_storage = storage
    end

    def upload(**params)
      override = _invoke(:upload, params)
      return override unless override.nil?

      index = params.fetch(:index)
      @_storage.objects[index.fetch("key")] = {"kind" => "object", "etag" => "landmarks", "bytes" => index.fetch("bytes")}
      nil
    end
  end

  def setup
    @_directory = Dir.mktmpdir("mapshot-ruby-import-test-")
    @_now = (Time.now.to_f * 1000).to_i
    @_input = {
      "id" => "a" * 64,
      "archive" => {"key" => "20261011.pmtiles", "bytes" => 127, "blake3" => "b" * 64, "version" => "4.15.2", "observedAt" => 1000},
    }
    @_storage = Storage.new
    @_archives = Archives.new
    @_domain = Domain.new
    @_files = Files.new(storage: @_storage)
    @_service = _service
  end

  def teardown
    FileUtils.remove_entry(@_directory)
  end

  def test_hands_durable_transfer_and_verification_receipts_between_separate_jobs
    assert_equal "verifying", _run(phase: "transfer").fetch("phase")
    assert_nil @_storage.checkpoint.fetch("verifiedArchive")
    assert_empty @_domain.calls(:verify_archive_and_extract_landmarks)
    assert_equal "references", _run(phase: "verify", service: _service).fetch("phase")
    assert_equal true, @_storage.checkpoint.dig("verifiedArchive", "digest", "verified")
    refute_nil @_storage.checkpoint.fetch("packedIndex")
    result = _run(phase: "prepare", service: _service)
    assert_equal "ready", result.fetch("kind")
    assert_equal result, @_storage.checkpoint.fetch("status")
    assert_equal 1, @_archives.calls(:read).length
    assert_equal 1, @_domain.calls(:verify_archive_and_extract_landmarks).length
    assert_equal 1, @_domain.calls(:prepare_indexes).length
    assert_equal result, _run(phase: "prepare", service: _service)
    assert_equal(["import-job", "import-checkpoint", "import-job", "import-job", "source-release", "import-job"], @_domain.calls(:validate).map { |call| call.fetch(:kind) })
    assert_equal result.fetch("release"), @_domain.calls(:validate).find { |call| call.fetch(:kind) == "source-release" }.fetch(:value)
  end

  def test_yields_after_the_first_source_pin_when_less_than_ninety_seconds_remain
    @_input.fetch("archive")["bytes"] = PART_BYTES + 127
    assert_equal "running", _run(phase: "transfer", deadline_at: @_now + 89_999).fetch("kind")
    assert_equal "uploading", @_storage.checkpoint.fetch("stage")
    assert_equal([1], @_storage.checkpoint.fetch("parts").map { |part| part.fetch("partNumber") })
    assert_equal 1, @_archives.calls(:read).length
    assert_equal "verifying", _run(phase: "transfer", service: _service).fetch("phase")
    assert_equal([PART_BYTES, 127], @_archives.calls(:read).map { |call| call.fetch(:length) })
    assert_equal '"origin"', @_archives.calls(:read).last.fetch(:etag)
  end

  def test_reads_at_most_two_parallel_parts_after_persisting_the_source_etag
    @_input.fetch("archive")["bytes"] = (PART_BYTES * 3) + 1
    entered = Queue.new
    release = Queue.new
    readers = Mutex.new
    active_reads = 0
    maximum_reads = 0
    writes = Mutex.new
    active_writes = 0
    maximum_writes = 0
    @_storage.on(:write_checkpoint) do |params|
      if params.fetch(:value).fetch("stage") == "uploading" && params.fetch(:value).fetch("parts").length > 1
        writes.synchronize do
          active_writes += 1
          maximum_writes = [maximum_writes, active_writes].max
        end
        sleep 0.005
        writes.synchronize { active_writes -= 1 }
      end
      nil
    end
    @_archives.on(:read) do |params|
      if params.fetch(:offset).positive?
        readers.synchronize do
          active_reads += 1
          maximum_reads = [maximum_reads, active_reads].max
        end
        entered.push(params)
        release.pop
        readers.synchronize { active_reads -= 1 }
      end
      nil
    end
    importer = Thread.new { _run(phase: "transfer") }
    first = Timeout.timeout(5) { entered.pop }
    second = Timeout.timeout(5) { entered.pop }
    assert_equal '"origin"', @_storage.checkpoint.fetch("sourceEtag")
    assert_equal([1], @_storage.checkpoint.fetch("parts").map { |part| part.fetch("partNumber") })
    assert_equal [PART_BYTES, PART_BYTES * 2], [first.fetch(:offset), second.fetch(:offset)].sort
    2.times { release.push(true) }
    Timeout.timeout(5) { entered.pop }
    release.push(true)
    assert_equal "verifying", Timeout.timeout(5) { importer.value }.fetch("phase")
    assert_equal([1, 2, 3, 4], @_storage.checkpoint.fetch("parts").map { |part| part.fetch("partNumber") })
    assert_equal 4, @_storage.calls(:write_part).length
    assert_equal 2, maximum_reads
    assert_equal 1, maximum_writes
  ensure
    _stop_importer(importer: importer, release: release)
  end

  def test_retries_held_part_bytes_without_repeating_the_source_request
    @_storage.on(:write_part) do |_params|
      raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") if @_storage.calls(:write_part).length == 1
    end
    assert_equal "ready", _complete.fetch("kind")
    assert_equal 1, @_archives.calls(:read).length
    assert_equal 2, @_storage.calls(:write_part).length
    assert_equal 1, @_storage.calls(:write_part).map { |call| call.fetch(:bytes_id) }.uniq.length
  end

  def test_resumes_the_same_upload_after_both_held_byte_writes_fail
    @_storage.on(:write_part) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    _assert_failed(_run(phase: "transfer"), code: "STORAGE_UNAVAILABLE", retryable: true)
    @_storage.on(:write_part) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
    assert_equal 1, @_storage.checkpoint.fetch("generation")
    assert_equal 1, @_storage.calls(:create_multipart).length
  end

  def test_never_retries_a_nonretryable_part_failure
    @_storage.on(:write_part) { raise Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY") }
    _assert_failed(_run(phase: "transfer"), code: "INTEGRITY_FAILED", retryable: false)
    assert_equal 1, @_storage.calls(:write_part).length
    assert_empty @_storage.calls(:complete_multipart)
  end

  def test_preserves_the_archive_repository_failure_for_a_changed_source_etag
    @_input.fetch("archive")["bytes"] = PART_BYTES + 1
    @_archives.on(:read) do |params|
      next nil if params.fetch(:offset).zero?

      assert_equal '"origin"', params.fetch(:etag)
      raise Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY")
    end
    _assert_failed(_run(phase: "transfer"), code: "INTEGRITY_FAILED", retryable: false)
    assert_equal 1, @_storage.calls(:write_part).length
    assert_empty @_storage.calls(:complete_multipart)
  end

  def test_cancels_parallel_source_work_before_uploading_more_bytes
    @_input.fetch("archive")["bytes"] = PART_BYTES + 1
    signal = Cataqui::Mapshot::SourceImportSignal.new
    @_archives.on(:read) do |params|
      if params.fetch(:offset).positive?
        signal.abort!
        params.fetch(:signal).check!
      end
      nil
    end
    _assert_failed(_run(phase: "transfer", signal: signal), code: "ABORTED", retryable: true)
    assert_equal([1], @_storage.calls(:write_part).map { |call| call.fetch(:part_number) })
    assert_empty @_storage.calls(:complete_multipart)
    @_archives.on(:read) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
  end

  def test_reconciles_a_lost_completion_response_without_retransferring
    @_storage.on(:complete_multipart) do |params|
      @_storage.objects[params.fetch(:key)] = {"kind" => "object", "etag" => "archive", "bytes" => 127}
      raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE")
    end
    _assert_failed(_run(phase: "transfer"), code: "STORAGE_UNAVAILABLE", retryable: true)
    assert_equal "completing", @_storage.checkpoint.fetch("stage")
    assert_equal "ready", _complete(service: _service).fetch("kind")
    assert_equal 1, @_storage.calls(:complete_multipart).length
    assert_equal 1, @_archives.calls(:read).length
  end

  def test_rejects_wrong_object_length_when_reconciling_ambiguous_completion
    @_storage.on(:complete_multipart) do |params|
      @_storage.objects[params.fetch(:key)] = {"kind" => "object", "etag" => "archive", "bytes" => 128}
      raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE")
    end
    _run(phase: "transfer")
    _assert_failed(_run(phase: "transfer", service: _service), code: "INTEGRITY_FAILED", retryable: false)
    assert_equal 1, @_storage.calls(:complete_multipart).length
  end

  def test_rejects_a_multipart_completion_receipt_with_the_wrong_length
    @_storage.on(:complete_multipart) { {"kind" => "object", "etag" => "archive", "bytes" => 126} }
    _assert_failed(_run(phase: "transfer"), code: "INTEGRITY_FAILED", retryable: false)
    assert_empty @_domain.calls(:verify_archive_and_extract_landmarks)
  end

  def test_stops_after_three_ambiguous_creates_and_reuses_the_failure
    @_storage.on(:create_multipart) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    3.times do |index|
      _assert_failed(_run(phase: "transfer", service: _service), code: "STORAGE_UNAVAILABLE", retryable: true)
      assert_equal index + 1, @_storage.checkpoint.fetch("generation")
    end
    failed = _run(phase: "transfer", service: _service)
    _assert_failed(failed, code: "CAPACITY", retryable: false)
    assert_equal failed, _run(phase: "transfer", service: _service)
    assert_equal 3, @_storage.calls(:create_multipart).length
  end

  def test_restarts_an_exhausted_ambiguous_create_only_after_seven_day_expiry
    @_storage.on(:create_multipart) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    4.times { _run(phase: "transfer", service: _service) }
    @_storage.checkpoint["updatedAt"] = @_now - (7 * 24 * 60 * 60 * 1000)
    @_storage.on(:create_multipart) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
    assert_equal 1, @_storage.checkpoint.fetch("generation")
    assert_equal 4, @_storage.calls(:create_multipart).length
  end

  def test_does_not_reset_a_nonretryable_failure_from_reference_preparation
    _run(phase: "transfer")
    @_domain.on(:verify_archive_and_extract_landmarks) { raise Cataqui::Mapshot::SourceImportError.new(code: "ATTEMPTS_EXHAUSTED") }
    failed = _run(phase: "verify")
    _assert_failed(failed, code: "CAPACITY", retryable: false)
    @_storage.checkpoint["updatedAt"] = @_now - (8 * 24 * 60 * 60 * 1000)
    assert_equal failed, _run(phase: "verify", service: _service)
    assert_equal 1, @_domain.calls(:verify_archive_and_extract_landmarks).length
    assert_equal 1, @_storage.calls(:create_multipart).length
  end

  def test_aborts_a_known_upload_before_replacing_an_ambiguous_attempt
    @_archives.on(:read) { raise Cataqui::Mapshot::SourceImportError.new(code: "SOURCE") }
    _run(phase: "transfer")
    upload_id = @_storage.checkpoint.fetch("uploadId")
    @_storage.checkpoint["stage"] = "creating"
    @_archives.on(:read) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
    assert_equal upload_id, @_storage.calls(:abort_multipart).fetch(0).fetch(:upload_id)
    assert_equal 2, @_storage.checkpoint.fetch("generation")
  end

  def test_rejects_capacity_before_creating_a_checkpoint
    @_input.fetch("archive")["bytes"] = (PART_BYTES * 10_000) + 1
    _assert_failed(_run(phase: "transfer"), code: "CAPACITY", retryable: false)
    assert_nil @_storage.checkpoint
    assert_empty @_storage.calls(:write_checkpoint)
    assert_empty @_storage.calls(:create_multipart)
  end

  def test_preserves_an_explicit_destination_key_across_creation
    @_input["objectKey"] = "source/bootstrap/world.pmtiles"
    assert_equal "ready", _complete.fetch("kind")
    assert_equal @_input.fetch("objectKey"), @_storage.checkpoint.fetch("objectKey")
    assert_equal @_input.fetch("objectKey"), @_storage.calls(:create_multipart).fetch(0).fetch(:key)
  end

  def test_persists_the_authoritative_normalized_input
    @_input["ignored"] = "discarded"
    normalized = @_input.except("ignored")
    @_domain.on(:validate) { |params| normalized if params.fetch(:kind) == "import-job" }
    assert_equal "verifying", _run(phase: "transfer").fetch("phase")
    assert_equal normalized, @_storage.checkpoint.fetch("input")
    assert_equal 1, (@_domain.calls(:validate).count { |call| call.fetch(:kind) == "import-job" })
  end

  def test_rejects_an_invalid_initial_checkpoint_before_persisting_it
    @_domain.on(:validate) do |params|
      raise Cataqui::Mapshot::SourceImportError.new(code: "INVALID_INPUT") if params.fetch(:kind) == "import-checkpoint"
    end
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer") }
    assert_equal "INVALID_INPUT", error.code
    assert_empty @_storage.calls(:write_checkpoint)
    @_domain.on(:validate) { nil }
    assert_equal "ready", _complete.fetch("kind")
  end

  def test_reuses_verified_receipts_after_index_preparation_fails
    @_domain.on(:prepare_indexes) { raise "Private provider details" }
    _assert_failed(_complete, code: "GENERATION_FAILED", retryable: true)
    @_domain.on(:prepare_indexes) { nil }
    assert_equal "ready", _run(phase: "prepare", service: _service).fetch("kind")
    assert_equal 1, @_domain.calls(:verify_archive_and_extract_landmarks).length
    assert_equal 1, @_files.calls(:upload).length
    assert_equal 1, @_archives.calls(:read).length
  end

  def test_detects_changed_stored_archive_before_reusing_verified_receipts
    _run(phase: "transfer")
    _run(phase: "verify")
    @_storage.objects.fetch(@_storage.checkpoint.fetch("objectKey"))["etag"] = "changed"
    _assert_failed(_run(phase: "prepare", service: _service), code: "INTEGRITY_FAILED", retryable: false)
    assert_empty @_domain.calls(:prepare_indexes)
  end

  def test_refuses_to_rebuild_a_missing_index_in_the_preparation_only_job
    _run(phase: "transfer")
    _run(phase: "verify")
    @_storage.objects.delete(@_storage.checkpoint.fetch("packedIndex").fetch("key"))
    _assert_failed(_run(phase: "prepare", service: _service), code: "GENERATION_FAILED", retryable: true)
    assert_equal 1, @_domain.calls(:verify_archive_and_extract_landmarks).length
    assert_empty @_domain.calls(:prepare_indexes)
  end

  def test_persists_a_heartbeat_while_the_node_archive_computation_is_active
    _run(phase: "transfer")
    heartbeat_status = nil
    @_domain.on(:verify_archive_and_extract_landmarks) do |params|
      @_now += 5001
      params.fetch(:heartbeat).call
      heartbeat_status = JSON.parse(JSON.generate(@_storage.checkpoint.fetch("status")))
      nil
    end
    assert_equal "references", _run(phase: "verify").fetch("phase")
    assert_equal "running", heartbeat_status.fetch("kind")
    assert_equal "verifying", heartbeat_status.fetch("phase")
    assert_equal @_now, heartbeat_status.fetch("updatedAt")
  end

  def test_rejects_prepared_indexes_for_a_different_archive
    _run(phase: "transfer")
    _run(phase: "verify")
    @_domain.on(:prepare_indexes) do |_params|
      {"reference" => {"manifestKey" => "source/indexes/wrong/manifest.json", "archiveId" => "0" * 64}, "files" => []}
    end
    _assert_failed(_run(phase: "prepare"), code: "INTEGRITY_FAILED", retryable: false)
    refute_equal "ready", @_storage.checkpoint.fetch("stage")
  end

  def test_uploads_a_prepared_index_file_larger_than_eight_mebibytes
    _run(phase: "transfer")
    _run(phase: "verify")
    body = "{}" + ("\n" * (8 * 1024 * 1024))
    @_domain.on(:prepare_indexes) do |params|
      path = File.join(params.fetch(:work_directory), "manifest.json")
      File.binwrite(path, body)
      sha256 = Digest::SHA256.hexdigest(body)
      archive_id = params.fetch(:release).dig("pmtiles", "id")
      key = "source/indexes/v1/#{archive_id}/#{sha256}/manifest.json"
      {"reference" => {"manifestKey" => key, "archiveId" => archive_id, "sha256" => sha256, "bytes" => body.bytesize},
       "files" => [{"key" => key, "path" => path, "contentType" => "application/json", "sha256" => sha256, "bytes" => body.bytesize}]}
    end

    assert_equal "ready", _run(phase: "prepare").fetch("kind")
    assert_equal body, @_storage.calls(:put_raw).first.fetch(:bytes)
    assert_equal "ready", @_storage.checkpoint.fetch("stage")
  end

  def test_waits_for_the_bundle_manifest_write_before_acknowledging_ready
    _run(phase: "transfer")
    _run(phase: "verify")
    entered = Queue.new
    release = Queue.new
    @_storage.on(:put_raw) do |_params|
      entered.push(true)
      release.pop
      nil
    end
    importer = Thread.new { _run(phase: "prepare") }
    Timeout.timeout(5) { entered.pop }
    assert_equal "running", @_storage.checkpoint.fetch("status").fetch("kind")
    assert importer.alive?
    release.push(true)
    assert_equal "ready", Timeout.timeout(5) { importer.value }.fetch("kind")
  ensure
    _stop_importer(importer: importer, release: release)
  end

  def test_never_publishes_ready_after_an_index_object_write_failure
    @_storage.on(:put_raw) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    _assert_failed(_complete, code: "STORAGE_UNAVAILABLE", retryable: true)
    assert_equal "references", @_storage.checkpoint.fetch("stage")
    refute(@_storage.calls(:write_checkpoint).any? { |call| call.fetch(:value).dig("status", "kind") == "ready" })
  end

  def test_rejects_a_durable_part_receipt_beyond_the_pinned_archive_length
    @_archives.on(:read) { raise Cataqui::Mapshot::SourceImportError.new(code: "SOURCE") }
    _run(phase: "transfer")
    @_storage.checkpoint["parts"] = [{"partNumber" => 2, "etag" => "unexpected"}]
    @_archives.on(:read) { nil }
    _assert_failed(_run(phase: "transfer", service: _service), code: "INTEGRITY_FAILED", retryable: false)
    assert_empty @_storage.calls(:complete_multipart)
  end

  def test_rejects_an_uploading_checkpoint_without_an_upload_id
    @_archives.on(:read) { raise Cataqui::Mapshot::SourceImportError.new(code: "SOURCE") }
    _run(phase: "transfer")
    @_storage.checkpoint["uploadId"] = nil
    _assert_failed(_run(phase: "transfer", service: _service), code: "INTEGRITY_FAILED", retryable: false)
    assert_equal 1, @_storage.calls(:create_multipart).length
  end

  def test_rejects_a_verification_checkpoint_without_an_object_etag
    _run(phase: "transfer")
    @_storage.checkpoint["objectEtag"] = nil
    _assert_failed(_run(phase: "verify", service: _service), code: "INTEGRITY_FAILED", retryable: false)
    assert_empty @_domain.calls(:verify_archive_and_extract_landmarks)
  end

  def test_never_persists_verification_when_uploading_the_landmark_index_fails
    _run(phase: "transfer")
    @_files.on(:upload) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    _assert_failed(_run(phase: "verify"), code: "STORAGE_UNAVAILABLE", retryable: true)
    assert_nil @_storage.checkpoint.fetch("verifiedArchive")
    assert_nil @_storage.checkpoint.fetch("packedIndex")
    assert_empty Dir.children(@_directory)
  end

  def test_cleans_temporary_verification_files_after_domain_failure
    _run(phase: "transfer")
    @_domain.on(:verify_archive_and_extract_landmarks) do |params|
      File.binwrite(File.join(params.fetch(:work_directory), "partial.pmtiles"), "partial")
      raise Cataqui::Mapshot::SourceImportError.new(code: "INTEGRITY")
    end
    _assert_failed(_run(phase: "verify"), code: "INTEGRITY_FAILED", retryable: false)
    assert_empty Dir.children(@_directory)
    assert_empty @_files.calls(:upload)
  end

  def test_rejects_a_different_payload_reusing_a_durable_job_id
    _run(phase: "transfer")
    input = JSON.parse(JSON.generate(@_input))
    input.fetch("archive")["version"] = "4.15.3"
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "verify", input: input, service: _service) }
    assert_equal "CONFLICT", error.code
    assert_equal @_input, @_storage.checkpoint.fetch("input")
  end

  #: () -> void
  def test_resumes_the_same_validated_input_independently_of_object_key_order
    _run(phase: "transfer")
    input = @_input.to_a.reverse.to_h
    input["archive"] = input.fetch("archive").to_a.reverse.to_h

    assert_equal "references", _run(phase: "verify", input: input, service: _service).fetch("phase")
    assert_equal @_input, @_storage.checkpoint.fetch("input")
    assert_equal 1, @_storage.calls(:create_multipart).length
  end

  def test_reconciles_a_competing_initial_write_through_the_durable_checkpoint
    @_storage.on(:write_checkpoint) do |params|
      if params.fetch(:expected_etag).nil?
        @_storage.install(params.fetch(:value))
        {"kind" => "conflict"}
      end
    end
    assert_equal "planning", _run(phase: "transfer").fetch("phase")
    assert_empty @_archives.calls(:read)
    assert_equal "ready", _complete(service: _service).fetch("kind")
  end

  def test_rejects_an_initial_write_conflict_without_a_matching_checkpoint
    @_storage.on(:write_checkpoint) { {"kind" => "conflict"} }
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer") }
    assert_equal "CONFLICT", error.code
    assert_empty @_archives.calls(:read)
  end

  #: () -> void
  def test_rejects_a_competing_initial_write_for_different_validated_input
    @_storage.on(:write_checkpoint) do |params|
      checkpoint = JSON.parse(JSON.generate(params.fetch(:value)))
      checkpoint.fetch("input").fetch("archive")["version"] = "4.15.3"
      @_storage.install(checkpoint)
      {"kind" => "conflict"}
    end

    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer") }
    assert_equal "CONFLICT", error.code
    assert_empty @_archives.calls(:read)
  end

  def test_never_publishes_after_losing_a_conditional_progress_write
    @_storage.on(:write_checkpoint) do |params|
      if params.fetch(:value).fetch("stage") == "references" && params.fetch(:value).dig("status", "kind") == "running"
        {"kind" => "conflict"}
      end
    end
    _assert_failed(_complete, code: "STORAGE_UNAVAILABLE", retryable: true)
    assert_empty @_domain.calls(:prepare_indexes)
  end

  def test_can_retry_after_loading_the_checkpoint_fails
    @_storage.on(:read_checkpoint) { raise Cataqui::Mapshot::SourceImportError.new(code: "STORAGE") }
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer") }
    assert_equal "STORAGE", error.code
    @_storage.on(:read_checkpoint) { nil }
    assert_equal "ready", _complete.fetch("kind")
  end

  def test_does_not_load_a_checkpoint_for_an_already_aborted_caller
    signal = Cataqui::Mapshot::SourceImportSignal.new
    signal.abort!
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer", signal: signal) }
    assert_equal "ABORTED", error.code
    assert_empty @_storage.calls(:read_checkpoint)
    assert_equal "ready", _complete.fetch("kind")
  end

  def test_does_not_create_a_checkpoint_when_the_caller_aborts_during_loading
    signal = Cataqui::Mapshot::SourceImportSignal.new
    @_storage.on(:read_checkpoint) do |_params|
      signal.abort!
      nil
    end
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "transfer", signal: signal) }
    assert_equal "ABORTED", error.code
    assert_empty @_storage.calls(:write_checkpoint)
    @_storage.on(:read_checkpoint) { nil }
    assert_equal "ready", _complete.fetch("kind")
  end

  def test_persists_a_cancelled_execution_with_a_fresh_bounded_signal
    signal = Cataqui::Mapshot::SourceImportSignal.new
    @_archives.on(:read) do |_params|
      signal.abort!
      raise Cataqui::Mapshot::SourceImportError.new(code: "ABORTED")
    end
    result = _run(phase: "transfer", signal: signal)
    _assert_failed(result, code: "ABORTED", retryable: true)
    failure_write = @_storage.calls(:write_checkpoint).last
    refute_same signal, failure_write.fetch(:signal)
    refute failure_write.fetch(:signal).aborted?
    assert_equal result, @_storage.checkpoint.fetch("status")
    @_archives.on(:read) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
  end

  def test_persists_a_resumable_failure_when_the_execution_deadline_expires
    @_archives.on(:read) do |params|
      params.fetch(:signal).with_timeout(seconds: 1) { sleep 1 }
    end
    result = _run(phase: "transfer", deadline_at: @_now + 25)
    _assert_failed(result, code: "ABORTED", retryable: true)
    assert_equal result, @_storage.checkpoint.fetch("status")
    assert_empty @_domain.calls(:verify_archive_and_extract_landmarks)
    refute @_storage.calls(:write_checkpoint).last.fetch(:signal).aborted?
    @_archives.on(:read) { nil }
    assert_equal "ready", _complete(service: _service).fetch("kind")
  end

  def test_reports_invalid_domain_inputs_without_exposing_private_details
    _run(phase: "transfer")
    @_domain.on(:verify_archive_and_extract_landmarks) { raise Cataqui::Mapshot::SourceImportError.new(code: "INVALID_INPUT") }
    _assert_failed(_run(phase: "verify"), code: "INVALID_CONFIG", retryable: false)
    refute(@_domain.calls(:validate).any? { |params| params.fetch(:kind) == "source-release" })
  end

  def test_waits_for_the_durable_terminal_acknowledgement
    _run(phase: "transfer")
    _run(phase: "verify")
    entered = Queue.new
    release = Queue.new
    @_storage.on(:write_checkpoint) do |params|
      if params.fetch(:value).dig("status", "kind") == "ready"
        entered.push(true)
        release.pop
      end
      nil
    end
    importer = Thread.new { _run(phase: "prepare") }
    Timeout.timeout(5) { entered.pop }
    assert_equal "running", @_storage.checkpoint.fetch("status").fetch("kind")
    assert importer.alive?
    release.push(true)
    assert_equal "ready", Timeout.timeout(5) { importer.value }.fetch("kind")
    assert_equal "ready", @_storage.checkpoint.fetch("status").fetch("kind")
  ensure
    _stop_importer(importer: importer, release: release)
  end

  def test_does_not_return_ready_if_the_terminal_checkpoint_loses_its_write
    _run(phase: "transfer")
    _run(phase: "verify")
    @_storage.on(:write_checkpoint) do |params|
      {"kind" => "conflict"} if params.fetch(:value).dig("status", "kind") == "ready"
    end
    _assert_failed(_run(phase: "prepare"), code: "STORAGE_UNAVAILABLE", retryable: true)
    assert_equal "references", @_storage.checkpoint.fetch("stage")
  end

  def test_preserves_a_competing_checkpoint_when_both_terminal_and_failure_receipts_lose_their_write
    _run(phase: "transfer")
    _run(phase: "verify")
    winner = nil
    @_storage.on(:write_checkpoint) do |params|
      if params.fetch(:value).dig("status", "kind") == "ready"
        winner = JSON.parse(JSON.generate(@_storage.checkpoint))
        winner["updatedAt"] += 1
        winner.fetch("status")["updatedAt"] = winner.fetch("updatedAt")
        @_storage.install(winner)
        {"kind" => "conflict"}
      end
    end
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { _run(phase: "prepare") }
    assert_equal "CONFLICT", error.code
    assert_equal winner, @_storage.checkpoint
    assert_equal "running", @_storage.checkpoint.fetch("status").fetch("kind")
  end

  private

  def _stop_importer(importer:, release:)
    return if importer.nil?

    4.times { release.push(true) }
    importer.kill
    raise "Importer test cleanup did not finish." if importer.join(5).nil?
  end

  def _service
    Cataqui::Mapshot::SourceImportService.new(storage: @_storage, archives: @_archives, domain: @_domain, files: @_files,
      clock: -> { @_now }, temp_directory: @_directory)
  end

  def _run(phase:, service: @_service, input: @_input, deadline_at: @_now + 300_000, signal: nil)
    service.run(input: input, phase: phase, deadline_at: deadline_at, signal: signal)
  end

  def _complete(service: @_service)
    result = nil
    %w[transfer verify prepare].each do |phase|
      result = _run(phase: phase, service: service)
      return result unless result.fetch("kind") == "running"
    end
    result
  end

  def _assert_failed(result, code:, retryable:)
    assert_equal({"kind" => "failed", "id" => @_input.fetch("id"), "code" => code, "retryable" => retryable}, result)
  end

end
