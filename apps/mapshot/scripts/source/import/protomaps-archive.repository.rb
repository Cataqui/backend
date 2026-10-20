# frozen_string_literal: true

require "net/http"
require "uri"

module Cataqui
  module Mapshot
    # Protomaps has no supported SDK for ranged archive reads; Net::HTTP owns the
    # conditional, identity-encoded transport and closes it after the response.
    class ProtomapsArchiveRepository
      def initialize(http: Net::HTTP)
        @_http = http
      end

      def read(key:, offset:, length:, etag:, timeout:, &response)
        uri = URI("https://build.protomaps.com/#{key}")
        request = Net::HTTP::Get.new(uri)
        request["range"] = "bytes=#{offset}-#{offset + length - 1}"
        request["accept-encoding"] = "identity"
        request["user-agent"] = "cataqui-source-import/1"
        request["if-match"] = etag unless etag.nil?
        @_http.start(uri.host, uri.port, use_ssl: true, open_timeout: timeout, read_timeout: timeout, write_timeout: timeout) do |client|
          client.request(request, &response)
        end
      end
    end
  end
end
