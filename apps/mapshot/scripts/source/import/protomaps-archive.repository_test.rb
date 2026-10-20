# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "protomaps-archive.repository"

class MapshotProtomapsArchiveRepositoryTest < Minitest::Test
  class Http
    attr_accessor :response, :failure
    attr_reader :started, :request_input, :closed

    def initialize
      @response = Net::HTTPNotFound.new("1.1", "404", "Not Found")
    end

    def start(host, port, **options)
      @started = [host, port, options]
      raise failure if failure

      yield self
    ensure
      @closed = true
    end

    def request(input)
      @request_input = input
      yield response
    end
  end

  def setup
    @_http = Http.new
    @_repository = Cataqui::Mapshot::ProtomapsArchiveRepository.new(http: @_http)
  end

  def test_requests_the_official_archive_with_native_conditional_range_headers
    result = @_repository.read(key: "20261011.pmtiles", offset: 2, length: 2, etag: '"etag"', timeout: 180) { |response| response }
    assert_same @_http.response, result
    assert_equal ["build.protomaps.com", 443, {use_ssl: true, open_timeout: 180, read_timeout: 180, write_timeout: 180}], @_http.started
    request = @_http.request_input
    assert_equal "/20261011.pmtiles", request.path
    assert_equal "bytes=2-3", request["range"]
    assert_equal '"etag"', request["if-match"]
    assert_equal "identity", request["accept-encoding"]
    assert_equal "cataqui-source-import/1", request["user-agent"]
    assert @_http.closed
    assert_instance_of Cataqui::Mapshot::ProtomapsArchiveRepository, Cataqui::Mapshot::ProtomapsArchiveRepository.new
  end

  def test_does_not_add_an_etag_condition_for_the_initial_read
    @_repository.read(key: "20261011.pmtiles", offset: 0, length: 127, etag: nil, timeout: 20) { |response| response }
    assert_nil @_http.request_input["if-match"]
  end

  def test_preserves_provider_failures_and_closes_the_transport
    failure = IOError.new("provider failure")
    @_http.failure = failure
    actual = assert_raises(IOError) do
      @_repository.read(key: "20261011.pmtiles", offset: 0, length: 127, etag: nil, timeout: 20) { |response| response }
    end
    assert_same failure, actual
    assert @_http.closed
  end
end
