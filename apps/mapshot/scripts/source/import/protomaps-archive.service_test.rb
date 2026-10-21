# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "protomaps-archive.service"

class MapshotProtomapsArchiveServiceTest < Minitest::Test
  ARCHIVE = {"key" => "20261011.pmtiles", "bytes" => 127}.freeze

  class Response
    attr_accessor :code, :headers, :chunks, :failure, :on_read
    attr_reader :consumed

    def initialize
      @code = "206"
      @headers = {"content-range" => "bytes 2-3/127", "content-length" => "2", "etag" => '"etag"'}
      @chunks = ["ab"]
      @consumed = 0
    end

    def [](key)
      headers[key]
    end

    def read_body
      on_read&.call
      raise failure if failure

      chunks.each do |chunk|
        @consumed += 1
        yield(chunk)
      end
    end
  end

  class Repository
    attr_accessor :response, :failure, :on_read, :deliver_response
    attr_reader :input, :closed

    def initialize
      @response = Response.new
      @deliver_response = true
    end

    def read(**params)
      @input = params
      on_read&.call
      raise failure if failure

      yield response if deliver_response
    ensure
      @closed = true
    end
  end

  def setup
    @_repository = Repository.new
    @_signal = Cataqui::Mapshot::SourceImportSignal.new
    @_service = Cataqui::Mapshot::ProtomapsArchiveService.new(repository: @_repository)
  end

  def test_reads_the_requested_archive_range_through_its_repository
    assert_equal({"bytes" => "ab", "etag" => '"etag"'}, _read(etag: '"etag"'))
    assert_equal({key: "20261011.pmtiles", offset: 2, length: 2, etag: '"etag"', timeout: 180}, @_repository.input)
    assert @_repository.closed
    assert_instance_of Cataqui::Mapshot::ProtomapsArchiveService, Cataqui::Mapshot::ProtomapsArchiveService.new
  end

  def test_rejects_redirects_unpinned_metadata_encoding_and_changed_etags_without_reading_the_body
    [{"content-range" => "bytes 2-3/128"}, {"content-length" => "3"}, {"etag" => 'W/"etag"'},
      {"etag" => ""}, {"etag" => nil}, {"content-encoding" => "gzip"}].each do |headers|
      @_repository.response = Response.new
      @_repository.response.headers.merge!(headers)
      _assert_code("INTEGRITY") { _read }
      assert_equal 0, @_repository.response.consumed
      assert @_repository.closed
    end
    @_repository.response = Response.new
    @_repository.response.code = "302"
    _assert_code("INTEGRITY") { _read }
    @_repository.response.code = "200"
    _assert_code("INTEGRITY") { _read }
    @_repository.response.code = "206"
    _assert_code("INTEGRITY") { _read(etag: '"old"') }
  end

  def test_enforces_exact_stream_length_before_retaining_extra_bytes
    [[], ["a"], ["abc"], ["a", "b", "c"], [42]].each do |chunks|
      @_repository.response = Response.new
      @_repository.response.chunks = chunks
      _assert_code("INTEGRITY") { _read }
      assert @_repository.closed
    end
    @_repository.response = Response.new
    @_repository.response.chunks = ["a", "b"]
    assert_equal "ab", _read.fetch("bytes")
    @_repository.response.headers["content-encoding"] = "identity"
    assert_equal "ab", _read.fetch("bytes")
  end

  def test_sanitizes_provider_and_response_body_failures
    @_repository.failure = IOError.new("private token")
    _assert_code("SOURCE") { _read }
    @_repository.failure = nil
    @_repository.response.failure = IOError.new("private body")
    _assert_code("SOURCE") { _read }
    assert @_repository.closed
  end

  def test_rejects_a_transport_that_finishes_without_delivering_a_response
    @_repository.deliver_response = false
    _assert_code("SOURCE") { _read }
    assert @_repository.closed
  end

  def test_cancels_before_the_request_and_during_header_or_body_processing
    @_signal.abort!
    _assert_code("ABORTED") { _read(signal: @_signal) }
    assert_nil @_repository.input
    @_signal = Cataqui::Mapshot::SourceImportSignal.new
    @_repository.on_read = -> { @_signal.abort! }
    _assert_code("ABORTED") { _read(signal: @_signal) }
    assert_equal 0, @_repository.response.consumed
    @_signal = Cataqui::Mapshot::SourceImportSignal.new
    @_repository.on_read = nil
    @_repository.response.on_read = -> { @_signal.abort! }
    _assert_code("ABORTED") { _read(signal: @_signal) }
    assert @_repository.closed
  end

  def test_aborts_when_the_production_archive_read_deadline_expires
    original = Time.method(:now)
    now = original.call
    Time.define_singleton_method(:now) { now }
    @_repository.on_read = -> { now += 179 }
    assert_equal "ab", _read.fetch("bytes")
    @_repository.on_read = -> { now += 180 }
    _assert_code("ABORTED") { _read }
    assert_equal 180, @_repository.input.fetch(:timeout)
    assert @_repository.closed
  ensure
    Time.define_singleton_method(:now, original)
  end

  def test_sanitizes_a_provider_failure_when_the_caller_aborts_at_the_same_time
    @_repository.on_read = -> { @_signal.abort!; raise IOError, "private" }
    _assert_code("ABORTED") { _read(signal: @_signal) }
  end

  private

  def _read(**changes)
    @_service.read(**{archive: ARCHIVE, offset: 2, length: 2}.merge(changes))
  end

  def _assert_code(code)
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { yield }
    assert_equal code, error.code
    assert_equal "The source import did not complete.", error.message
  end
end
