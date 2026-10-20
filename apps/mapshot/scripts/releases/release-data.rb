#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "optparse"
require_relative "domain-tools"
require_relative "mapshot-deployment"
require_relative "mapshot-source-reservation"
require_relative "mapshot-source"
require_relative "mapshot-promotion"
require_relative "mapshot-copy"
require_relative "mapshot-retention"
require_relative "../source/import/source-import-storage.service"
require_relative "../source/import/source-import.service"
require_relative "../source/import/protomaps-archive.service"
require_relative "../source/refresh/protomaps-source.service"
require_relative "../source/promotion/promotion-inventory.service"

module Cataqui
  module Mapshot
    # The provider SDK owns R2 operations. This composition gives the resumable
    # source journal and successful staging selection their application owners.
    class ReleaseDataTools
      attr_reader :storage, :state, :reservations, :sources, :promotion, :retention

      def initialize(environment:, variables:, domain:)
        @storage = SourceImportStorageService.from_environment(environment: environment, variables: variables, domain: domain)
        @state = Deployment.new(storage: storage, data: domain)
        @reservations = SourceReservation.new(state: state)
        staging_storage = environment == "staging" ? storage :
          SourceImportStorageService.from_environment(environment: "staging", variables: variables, domain: domain)
        @sources = Source.new(
          state: state, reservations: reservations, storage: storage,
          archives: ProtomapsSourceService.new(domain: domain),
          importer: SourceImportService.new(storage: storage, archives: ProtomapsArchiveService.new, domain: domain), data: domain
        )
        @promotion = Promotion.new(
          state: state, staging: Deployment.new(storage: staging_storage, data: domain), reservations: reservations,
          storage: storage, inventory: PromotionInventoryService.new(source: staging_storage, destination: storage, domain: domain),
          copy: Copy.new(source: staging_storage, source_bucket: "cataqui-mapshot-staging", destination: storage, data: domain), data: domain
        )
        @retention = Retention.new(state: state, storage: storage, data: domain)
      end
    end

    # GitHub invokes one operation per private JSON request. Ruby owns dispatch,
    # file/R2 IO and phase cancellation; the Node adapter only handles map data.
    class ReleaseData
      def initialize(domain: nil, create_tools: nil)
        @_domain = domain
        @_create_tools = create_tools || ->(**params) { ReleaseDataTools.new(**params) }
      end

      def run(arguments:, input:, variables: ENV, errors: $stderr)
        output = nil
        OptionParser.new do |parser|
          parser.on("--output PATH") { |value| output = value }
        end.parse!(arguments)
        raise ArgumentError, "A private output path is required." unless output && Pathname.new(output).absolute? && arguments.empty?

        encoded = input.read((1024 * 1024) + 1)
        raise ArgumentError, "Data request exceeds capacity." if encoded.nil? || encoded.bytesize > 1024 * 1024
        encoded.force_encoding(Encoding::UTF_8)
        raise ArgumentError, "Data request is not UTF-8." unless encoded.valid_encoding?

        request = JSON.parse(encoded)
        domain = @_domain || DomainTools.new(environment: request.fetch("environment"), variables: variables)
        request = domain.validate(kind: "release-input", value: request)
        tools = @_create_tools.call(environment: request.fetch("environment"), variables: variables, domain: domain)
        timeout = case request.fetch("operation")
        when "sources.prepare", "promotion.prepare" then 320 * 60
        when "retention.clean" then 20 * 60
        when "state.read", "state.write", "storage.headObject" then 15
        else 180
                  end
        result = SourceImportSignal.new.with_timeout(seconds: timeout) do |signal|
          signal.check!
          case request.fetch("operation")
          when "state.read"
            tools.state.read
          when "state.write"
            tools.state.write(etag: request.fetch("etag"), value: request.fetch("value"))
            nil
          when "sources.prepare"
            tools.sources.prepare(
              code_revision: request.fetch("codeRevision"), operation: request.fetch("operationId"), refresh: request.fetch("refresh"),
              phase: request.fetch("phase"), deadline_at: request.fetch("deadlineAt"), signal: signal
            )
          when "promotion.prepare"
            tools.promotion.prepare(
              operation: request.fetch("operationId"), code_revision: request.fetch("codeRevision"), promote: request.fetch("promote"),
              deadline_at: request.fetch("deadlineAt"), signal: signal
            )
          when "sources.readPrepared"
            tools.sources.read_prepared(slot: request.fetch("slot"), operation: request.fetch("operationId"), signal: signal)
          when "reservations.fingerprint"
            domain.fingerprint(source: request.fetch("source"))
          when "storage.putArtifact"
            tools.storage.put_raw(key: request.fetch("key"), bytes: File.binread(request.fetch("path")), content_type: "application/gzip", signal: signal)
            nil
          when "storage.headObject"
            tools.storage.head_object(key: request.fetch("key"), signal: signal, timeout: 15)
          when "storage.readRange"
            bytes = tools.storage.read_range(
              key: request.fetch("key"), offset: request.fetch("offset"), length: request.fetch("length"), etag: request.fetch("etag"), signal: signal
            )
            File.open(request.fetch("path"), File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) { |file| file.write(bytes) }
            nil
          when "retention.clean"
            tools.retention.clean(signal: signal)
            nil
          else
            raise ArgumentError, "Unsupported release data operation."
          end
        end
        File.open(output, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) { |file| file.write(JSON.generate(result)) }
        0
      rescue StandardError
        errors.puts("Mapshot data command failed; provider details were suppressed to protect credentials.")
        1
      end

    end
  end
end

if $PROGRAM_NAME == __FILE__
  exit Cataqui::Mapshot::ReleaseData.new.run(arguments: ARGV, input: $stdin)
end
