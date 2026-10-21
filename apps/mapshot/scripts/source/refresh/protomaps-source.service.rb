# frozen_string_literal: true

require "json"
require "time"
require_relative "basemap-source-refresh.error"
require_relative "../import/source-import.error"
require_relative "protomaps-source.repository"

module Cataqui
  module Mapshot
    class ProtomapsSourceService
      def initialize(domain:, repository: ProtomapsSourceRepository.new, now: -> { Time.now })
        @_domain = domain
        @_repository = repository
        @_now = now
      end

      def read_latest(signal: nil, timeout: 20)
        bounded = nil
        (signal || SourceImportSignal.new).with_timeout(seconds: timeout) do |active|
          bounded = active
          active.check!
          body = +"".b
          @_repository.read_builds(timeout: timeout) do |response|
            raise BasemapSourceRefreshError.new(reason: "discovery-failed") unless response.code.to_i.between?(200, 299)

            response.read_body do |chunk|
              active.check!
              unless chunk.is_a?(String) && !chunk.empty? && body.bytesize + chunk.bytesize <= 2 * 1024 * 1024
                raise BasemapSourceRefreshError.new(reason: "discovery-failed")
              end

              body << chunk.b
            end
          end
          body.force_encoding(Encoding::UTF_8)
          raise BasemapSourceRefreshError.new(reason: "discovery-failed") unless body.valid_encoding?

          builds = @_domain.validate(kind: "protomaps-builds", value: JSON.parse(body))
          latest = builds.select do |build|
            build.fetch("version").match?(/\A4\.\d+\.\d+\z/) && build.fetch("key").match?(/\A\d{8}\.pmtiles\z/)
          end.max_by { |build| [_timestamp(value: build.fetch("uploaded")), build.fetch("key")] }
          raise BasemapSourceRefreshError.new(reason: "discovery-failed") unless latest
          archive = @_domain.validate(kind: "protomaps-archive", value: {
                                        "key" => latest.fetch("key"), "bytes" => latest.fetch("size"), "blake3" => latest["b3sum"],
                                        "version" => latest.fetch("version"), "observedAt" => _timestamp(value: latest.fetch("uploaded"))
                                      })
          observed_in_future = archive.fetch("observedAt") > (@_now.call.to_r * 1000).floor
          raise BasemapSourceRefreshError.new(reason: "discovery-failed") if observed_in_future
          active.check!
          archive
        end
      rescue StandardError => error
        if bounded&.aborted? || signal&.aborted?
          raise BasemapSourceRefreshError.new(reason: "aborted"), cause: nil
        end
        raise error if error.is_a?(BasemapSourceRefreshError)

        raise BasemapSourceRefreshError.new(reason: "discovery-failed"), cause: nil
      end

      private

      def _timestamp(value:)
        (Time.iso8601(value).to_r * 1000).floor
      end
    end
  end
end
