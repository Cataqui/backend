# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "protomaps-source.service"

module Cataqui
  module Mapshot
    class ProtomapsSourceServiceTest < Minitest::Test
      def test_discovers_the_newest_compatible_release_independent_of_array_order
        requests = []
        builds = [_build.merge("key" => "20261003.pmtiles", "uploaded" => "2026-10-03T09:06:22.570Z"),
          _build.merge("version" => "5.0.0", "uploaded" => "2026-10-11T13:00:00.000Z"), _build]
        result = _service(body: JSON.generate(builds), requests: requests).read_latest

        assert_equal _archive, result
        assert_equal [{timeout: 20}], requests
      end

      def test_selects_the_greatest_dated_key_on_an_equal_upload_timestamp
        builds = [_build.merge("key" => "20261010.pmtiles"), _build]
        assert_equal "20261011.pmtiles", _service(body: JSON.generate(builds)).read_latest.fetch("key")
      end

      def test_compares_upload_timestamps_at_javascript_millisecond_precision
        builds = [_build.merge("key" => "20261010.pmtiles", "uploaded" => "2026-10-11T09:06:22.570999Z"), _build]
        assert_equal "20261011.pmtiles", _service(body: JSON.generate(builds)).read_latest.fetch("key")
      end

      def test_does_not_fall_back_when_the_newest_compatible_release_fails_archive_validation
        latest = _build.dup
        latest.delete("b3sum")
        builds = [_build.merge("uploaded" => "2026-10-03T09:06:22.570Z"), latest]
        validated = []
        domain = _domain do |kind, value|
          validated << [kind, value]
          raise ArgumentError, "private schema details" if kind == "protomaps-archive"

          value
        end
        _assert_failure(service: _service(body: JSON.generate(builds), domain: domain))
        assert_nil validated.last.last.fetch("blake3")
        assert_equal "20261011.pmtiles", validated.last.last.fetch("key")
      end

      def test_accepts_historic_unsupported_releases_without_an_integrity_digest
        historic = _build.merge("version" => "3.4.0")
        historic.delete("b3sum")
        assert_equal _archive, _service(body: JSON.generate([historic, _build])).read_latest
      end

      def test_returns_the_canonical_archive_from_the_authoritative_domain_validator
        calls = []
        canonical = _archive.freeze
        domain = _domain do |kind, value|
          calls << [kind, value]
          kind == "protomaps-archive" ? canonical : value
        end
        result = _service(domain: domain).read_latest
        assert_same canonical, result
        assert_equal [["protomaps-builds", [_build]], ["protomaps-archive", _archive]], calls
      end

      def test_sanitizes_authoritative_provider_schema_validation_failures
        domain = _domain { |_kind, _value| raise ArgumentError, "private schema details" }
        _assert_failure(service: _service(body: '[{"untrusted":"metadata"}]', domain: domain))
      end

      def test_rejects_malformed_json_or_a_body_without_a_compatible_archive
        ["invalid-json", "[]", JSON.generate([_build.merge("version" => "5.0.0")]),
          JSON.generate([_build.merge("key" => "../planet.pmtiles")])].each do |body|
          _assert_failure(service: _service(body: body))
        end
      end

      def test_rejects_a_future_latest_archive
        build = _build.merge("uploaded" => "2026-10-12T09:06:22.570Z")
        _assert_failure(service: _service(body: JSON.generate([build])))
      end

      def test_accepts_an_observation_equal_to_now
        now = Time.iso8601(_build.fetch("uploaded"))
        result = _service(now: -> { now }).read_latest
        assert_equal (now.to_r * 1000).floor, result.fetch("observedAt")
      end

      def test_rejects_invalid_utf8_and_a_leading_byte_order_mark
        ["\xc3\x28".b, "\uFEFF#{JSON.generate([_build])}"].each do |body|
          _assert_failure(service: _service(body: body))
        end
      end

      def test_streams_discovery_chunks_with_a_bounded_total_body
        raw = JSON.generate([_build])
        chunks = [raw.byteslice(0, 9), raw.byteslice(9..)]
        assert_equal _archive, _service(chunks: chunks).read_latest
        _assert_failure(service: _service(chunks: [" " * (2 * 1024 * 1024), " "]))
        assert_equal _archive, _service(chunks: [raw + (" " * ((2 * 1024 * 1024) - raw.bytesize))]).read_latest
      end

      def test_rejects_empty_or_nonbyte_chunks_and_an_absent_body
        [[], [""], [nil], [123]].each do |chunks|
          _assert_failure(service: _service(chunks: chunks))
        end
      end

      def test_rejects_failed_statuses_and_redirects_without_reading_their_bodies
        [204, 301, 302, 403, 500].each do |status|
          body_read = false
          http = lambda do |**_request, &receive|
            response = Struct.new(:code).new(status.to_s)
            response.define_singleton_method(:read_body) do |&stream|
              body_read = true
              stream.call("") if status == 204
            end
            receive.call(response)
          end
          _assert_failure(service: _service(http: http))
          assert_equal status == 204, body_read
        end
      end

      def test_sanitizes_transport_and_body_failures
        [false, true].each do |body_failure|
          http = lambda do |**_request, &receive|
            raise IOError, "private provider details" unless body_failure

            response = Struct.new(:code).new("200")
            response.define_singleton_method(:read_body) { raise IOError, "private body details" }
            receive.call(response)
          end
          _assert_failure(service: _service(http: http))
        end
      end

      def test_does_not_contact_discovery_when_already_canceled
        signal = SourceImportSignal.new
        signal.abort!
        requests = []
        _assert_failure(service: _service(requests: requests), signal: signal, reason: "aborted")
        assert_empty requests
      end

      def test_rejects_cancellation_triggered_by_the_provider
        signal = SourceImportSignal.new
        http = lambda do |**_request, &_receive|
          signal.abort!
          signal.check!
        end
        _assert_failure(service: _service(http: http), signal: signal, reason: "aborted")
      end

      def test_rejects_cancellation_at_the_end_of_the_response
        signal = SourceImportSignal.new
        service = _service(after_body: -> { signal.abort! })
        _assert_failure(service: service, signal: signal, reason: "aborted")
      end

      def test_bounds_a_stalled_discovery_request_and_releases_its_resources
        signal = SourceImportSignal.new
        original = signal.method(:with_timeout)
        timeouts = []
        signal.define_singleton_method(:with_timeout) do |seconds:, &operation|
          timeouts << seconds
          original.call(seconds: 0.03, &operation)
        end
        released = false
        http = lambda do |**_request, &_receive|
          begin
            sleep 5
          ensure
            released = true
          end
        end
        _assert_failure(service: _service(http: http), signal: signal, reason: "aborted")
        assert_equal [20], timeouts
        assert released
      end

      def test_interrupts_a_stalled_response_when_the_caller_aborts
        signal = SourceImportSignal.new
        started = Queue.new
        released = false
        http = lambda do |**_request, &_receive|
          begin
            started << true
            sleep 5
          ensure
            released = true
          end
        end
        aborter = Thread.new do
          started.pop
          signal.abort!
        end
        _assert_failure(service: _service(http: http), signal: signal, reason: "aborted")
        assert released
      ensure
        aborter&.join
      end

      private

      def _assert_failure(service:, signal: nil, reason: "discovery-failed")
        error = assert_raises(BasemapSourceRefreshError) { service.read_latest(signal: signal) }
        assert_equal "Map source refresh is temporarily unavailable.", error.message
        assert_equal reason, error.reason
        assert error.retryable
        assert_nil error.cause
      end

      def _service(body: JSON.generate([_build]), chunks: [body], requests: [], now: -> { Time.utc(2026, 10, 11, 16) },
        after_body: nil, domain: _domain, http: nil)
        response = _response(chunks: chunks, after_body: after_body)
        repository = Object.new
        repository.define_singleton_method(:read_builds) do |timeout:, &receive|
          requests << {timeout: timeout}
          http ? http.call(timeout: timeout, &receive) : receive.call(response)
        end
        ProtomapsSourceService.new(domain: domain, repository: repository, now: now)
      end

      def _response(chunks:, after_body: nil)
        response = Struct.new(:code).new("200")
        response.define_singleton_method(:read_body) do |&stream|
          chunks.each { |chunk| stream.call(chunk) }
          after_body&.call
        end
        response
      end

      def _domain(&validate)
        domain = Object.new
        domain.define_singleton_method(:validate) do |kind:, value:|
          validate ? validate.call(kind, value) : value
        end
        domain
      end

      def _build
        {"key" => "20261011.pmtiles", "size" => 138_796_124_160, "uploaded" => "2026-10-11T09:06:22.570Z",
         "version" => "4.15.2", "b3sum" => "f" * 64}
      end

      def _archive
        {"key" => "20261011.pmtiles", "bytes" => 138_796_124_160, "blake3" => "f" * 64,
         "version" => "4.15.2", "observedAt" => (Time.iso8601("2026-10-11T09:06:22.570Z").to_r * 1000).floor}
      end
    end
  end
end
