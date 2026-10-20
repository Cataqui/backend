# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "protomaps-source.repository"

module Cataqui
  module Mapshot
    class ProtomapsSourceRepositoryTest < Minitest::Test
      def test_returns_a_failed_provider_response_without_interpreting_it
        response = Struct.new(:code).new("503")
        requests = []
        provider = lambda do |**request, &receive|
          requests << request
          receive.call(response)
        end
        repository = ProtomapsSourceRepository.new(http: provider)

        assert_same response, repository.read_builds(timeout: 12) { |result| result }
        assert_equal [{uri: URI("https://build-metadata.protomaps.dev/builds.json"),
          headers: {"Accept" => "application/json"}, timeout: 12}], requests
      end

      def test_preserves_provider_failures_for_the_service_to_interpret
        failure = IOError.new("provider failure")
        provider = ->(**_request, &_receive) { raise failure }
        repository = ProtomapsSourceRepository.new(http: provider)

        assert_same failure, assert_raises(IOError) { repository.read_builds(timeout: 20) { |_response| flunk } }
      end

      def test_uses_supported_net_http_streaming_and_supplied_transport_settings
        requests = []
        response = Object.new
        client = Object.new
        client.define_singleton_method(:request) do |request, &receive|
          requests << request
          receive.call(response)
        end
        settings = []
        original = Net::HTTP.method(:start)
        Net::HTTP.define_singleton_method(:start) do |host, port, **options, &operation|
          settings << [host, port, options]
          operation.call(client)
        end

        result = ProtomapsSourceRepository.new.read_builds(timeout: 11) { |received| received }
        assert_same response, result
        assert_equal [["build-metadata.protomaps.dev", 443,
          {use_ssl: true, open_timeout: 11, read_timeout: 11, write_timeout: 11, max_retries: 0}]], settings
        assert_equal "/builds.json", requests.fetch(0).path
        assert_equal "application/json", requests.fetch(0)["Accept"]
      ensure
        Net::HTTP.define_singleton_method(:start, original) if original
      end
    end
  end
end
