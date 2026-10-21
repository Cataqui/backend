# frozen_string_literal: true

require "net/http"

module Cataqui
  module Mapshot
    # Protomaps publishes build discovery over HTTPS without a supported SDK.
    # Yielding the response keeps Net::HTTP's streaming lifetime at this boundary.
    class ProtomapsSourceRepository
      def initialize(http: nil)
        @_http = http
      end

      def read_builds(timeout:, &response)
        uri = URI("https://build-metadata.protomaps.dev/builds.json").freeze
        headers = {"Accept" => "application/json"}
        if @_http
          @_http.call(uri: uri, headers: headers, timeout: timeout, &response)
        else
          Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: timeout, read_timeout: timeout,
                                                  write_timeout: timeout, max_retries: 0) do |http|
            http.request(Net::HTTP::Get.new(uri, headers), &response)
          end
        end
      end

    end
  end
end
