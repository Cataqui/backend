# frozen_string_literal: true

require_relative "../../../test/test_helper"
require "digest"
require "stringio"
require_relative "source-import-file.service"

class MapshotSourceImportFileServiceTest < Minitest::Test
  class Storage
    attr_reader :created, :written, :completed, :aborted
    attr_accessor :on_create, :on_write, :on_complete, :on_abort, :complete_bytes

    def initialize(bytes:)
      @complete_bytes = bytes
      @created = []
      @written = []
      @completed = []
      @aborted = []
    end

    def create_multipart(**params)
      @created.push(params)
      on_create&.call(params)
      {"kind" => "multipart", "uploadId" => "upload"}
    end

    def write_part(**params)
      @written.push(params.except(:bytes).merge(bytes: params.fetch(:bytes).bytesize, sha256: Digest::SHA256.hexdigest(params.fetch(:bytes))))
      on_write&.call(params)
      "part-#{params.fetch(:part_number)}"
    end

    def complete_multipart(**params)
      @completed.push(params)
      on_complete&.call(params)
      {"kind" => "object", "etag" => "complete", "bytes" => complete_bytes}
    end

    def abort_multipart(**params)
      @aborted.push(params)
      on_abort&.call(params)
      {"kind" => "aborted"}
    end
  end

  class Repository
    attr_accessor :bytes
    attr_reader :path, :reads

    def initialize(bytes:)
      @bytes = bytes
      @reads = []
    end

    def open(path:)
      @path = path
      StringIO.open(bytes) { |file| yield file }
    end

    def read_part(file:, length:)
      @reads.push(length)
      file.read(length)
    end
  end

  def setup
    @_path = "/prepared/landmarks.pmtiles"
    bytes = "\x01" * 127
    @_index = {
      "key" => "source/import/attempts/#{"a" * 64}/0/references/landmarks.pmtiles",
      "bytes" => 127, "sha256" => Digest::SHA256.hexdigest(bytes)
    }
    @_storage = Storage.new(bytes: 127)
    @_repository = Repository.new(bytes: bytes)
    @_signal = Cataqui::Mapshot::SourceImportSignal.new
    @_service = Cataqui::Mapshot::SourceImportFileService.new(storage: @_storage, repository: @_repository)
  end

  def test_streams_the_producers_completed_index_before_completing_acknowledged_multipart_upload
    assert_nil @_service.upload(path: @_path, index: @_index, signal: @_signal)
    assert_equal @_path, @_repository.path
    assert_equal [127], @_repository.reads
    assert_equal [{key: @_index.fetch("key"), signal: @_signal}], @_storage.created
    assert_equal([127], @_storage.written.map { |part| part.fetch(:bytes) })
    assert_equal([@_index.fetch("sha256")], @_storage.written.map { |part| part.fetch(:sha256) })
    assert_equal [{"partNumber" => 1, "etag" => "part-1"}], @_storage.completed.fetch(0).fetch(:parts)
    assert_empty @_storage.aborted
  end

  def test_streams_a_larger_file_in_parts_bounded_to_64_mib
    _resize_fixture(bytes: (64 * 1024 * 1024) + 1)
    @_service.upload(path: @_path, index: @_index, signal: @_signal)
    assert_equal([64 * 1024 * 1024, 1], @_storage.written.map { |part| part.fetch(:bytes) })
    assert_equal([1, 2], @_storage.written.map { |part| part.fetch(:part_number) })
    assert_equal(["part-1", "part-2"], @_storage.completed.fetch(0).fetch(:parts).map { |part| part.fetch("etag") })
    assert_empty @_storage.aborted
  end

  def test_aborts_when_the_completed_object_has_a_different_byte_count
    @_storage.complete_bytes = 4
    _assert_integrity_failure
    assert_equal 1, @_storage.completed.length
    assert_equal 1, @_storage.aborted.length
  end

  def test_aborts_when_the_file_read_returns_fewer_bytes_than_expected
    @_repository.bytes = "a"
    _assert_integrity_failure
    assert_empty @_storage.written
    assert_empty @_storage.completed
    assert_equal 1, @_storage.aborted.length
  end

  def test_does_not_abort_an_upload_when_creation_fails
    @_storage.on_create = ->(_params) { raise "create failed" }
    error = assert_raises(RuntimeError) { @_service.upload(path: @_path, index: @_index, signal: @_signal) }
    assert_equal "create failed", error.message
    assert_empty @_storage.aborted
  end

  def test_aborts_when_writing_a_part_fails
    @_storage.on_write = ->(_params) { raise "write failed" }
    error = assert_raises(RuntimeError) { @_service.upload(path: @_path, index: @_index, signal: @_signal) }
    assert_equal "write failed", error.message
    assert_empty @_storage.completed
    assert_equal 1, @_storage.aborted.length
  end

  def test_aborts_when_completion_fails
    @_storage.on_complete = ->(_params) { raise "complete failed" }
    error = assert_raises(RuntimeError) { @_service.upload(path: @_path, index: @_index, signal: @_signal) }
    assert_equal "complete failed", error.message
    assert_equal 1, @_storage.aborted.length
  end

  def test_uses_a_fresh_bounded_cleanup_signal_when_the_upload_is_cancelled
    @_storage.on_create = ->(_params) { @_signal.abort! }
    error = assert_raises(Cataqui::Mapshot::SourceImportError) do
      @_service.upload(path: @_path, index: @_index, signal: @_signal)
    end
    assert_equal "ABORTED", error.code
    assert_empty @_storage.written
    assert_equal 1, @_storage.aborted.length
    cleanup_signal = @_storage.aborted.fetch(0).fetch(:signal)
    refute_same @_signal, cleanup_signal
    refute cleanup_signal.aborted?
  end

  def test_reports_failure_when_aborting_the_incomplete_upload_fails
    @_storage.on_write = ->(_params) { raise "write failed" }
    @_storage.on_abort = ->(_params) { raise "abort failed" }
    error = assert_raises(RuntimeError) { @_service.upload(path: @_path, index: @_index, signal: @_signal) }
    assert_equal "abort failed", error.message
    assert_equal 1, @_storage.aborted.length
  end

  private

  def _resize_fixture(bytes:)
    @_repository.bytes = @_repository.bytes.ljust(bytes, "\x00")
    @_index["bytes"] = bytes
    @_index["sha256"] = Digest::SHA256.hexdigest(@_repository.bytes)
    @_storage.complete_bytes = bytes
  end

  def _assert_integrity_failure
    error = assert_raises(Cataqui::Mapshot::SourceImportError) do
      @_service.upload(path: @_path, index: @_index, signal: @_signal)
    end
    assert_equal "INTEGRITY", error.code
  end
end
