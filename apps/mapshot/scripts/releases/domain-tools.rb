# frozen_string_literal: true

require "json"
require "tempfile"
require "timeout"
require "tmpdir"
require_relative "../source/import/source-import.error"
require_relative "../../build/data/source-identities"

module Cataqui
  module Mapshot
    # The Node adapter owns authoritative map formats, schemas and binary extraction.
    # Ruby owns content identities, provider IO and release orchestration.
    class DomainTools
      def initialize(environment:, application_root: File.expand_path("../..", __dir__), variables: ENV, execute: nil)
        @_environment = environment
        @_application_root = application_root
        @_variables = variables.to_h
        @_execute = execute
      end

      def validate(kind:, value:)
        _call(request: {"operation" => "validate", "kind" => kind, "value" => value})
      end

      def promotion_page_asset_limit
        _call(request: {"operation" => "promotion.pageAssetLimit"})
      end

      def fingerprint(source:)
        SourceIdentities.fingerprint(source: validate(kind: "source", value: source))
      end

      def validate_index_manifest(value:)
        _call(request: {"operation" => "index.files", "manifest" => value})
      end

      def verify_archive_and_extract_landmarks(checkpoint:, work_directory:, deadline_at:, signal: nil, heartbeat: nil)
        _call(request: {
                "operation" => "archive.verify", "environment" => @_environment, "checkpoint" => checkpoint,
                "workDirectory" => work_directory, "deadlineAt" => deadline_at
              }, signal: signal, timeout: 320 * 60, heartbeat: heartbeat)
      end

      def prepare_indexes(release:, landmarks:, work_directory:, deadline_at:, signal: nil)
        _call(request: {
                "operation" => "indexes.prepare", "environment" => @_environment, "release" => release,
                "landmarks" => landmarks, "workDirectory" => work_directory, "deadlineAt" => deadline_at
              }, signal: signal, timeout: 320 * 60)
      end

      private

      def _call(request:, signal: nil, timeout: 180, heartbeat: nil)
        signal&.check!
        Dir.mktmpdir("mapshot-domain-") do |directory|
          output = File.join(directory, "result.json")
          success = if @_execute
                      @_execute.call(request: request, output: output, signal: signal, timeout: timeout, heartbeat: heartbeat)
                    else
                      Tempfile.create("mapshot-domain-input-") do |input|
                        input.write(JSON.generate(request))
                        input.rewind
                        Tempfile.create("mapshot-domain-log-") do |log|
                          pid = Process.spawn(
                            @_variables, "node", File.join(@_application_root, "dist/tools/domain-data.mjs"), "--output", output,
                            chdir: @_application_root, pgroup: true, in: input, out: log, err: log
                          )
                          status = nil
                          begin
                            next_heartbeat = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
                            Timeout.timeout(timeout) do
                              loop do
                                signal&.check!
                                finished = Process.waitpid2(pid, Process::WNOHANG)
                                if finished
                                  status = finished.last
                                  break
                                end
                                raise SourceImportError.new(code: "PREPARATION") if log.size > 64 * 1024
                                if heartbeat && Process.clock_gettime(Process::CLOCK_MONOTONIC) >= next_heartbeat
                                  heartbeat.call
                                  next_heartbeat = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
                                end
                                sleep 0.01
                              end
                            end
                            raise SourceImportError.new(code: "PREPARATION") if log.size > 64 * 1024
                            status.success?
                          ensure
                            if status.nil?
                              begin
                                Process.kill("KILL", -pid)
                                Process.wait(pid)
                              rescue Errno::ESRCH, Errno::ECHILD
                                # A completed process group needs no further cancellation.
                              end
                            end
                          end
                        end
                      end
                    end
          value = JSON.parse(File.read(output, encoding: "UTF-8"))
          unless success
            code = value.is_a?(Hash) && value["error"].is_a?(Hash) ? value.fetch("error")["code"] : nil
            raise SourceImportError.new(code: code || "PREPARATION")
          end
          value
        end
      rescue SourceImportError
        raise
      rescue StandardError
        raise SourceImportError.new(code: "PREPARATION"), cause: nil
      end

    end
  end
end
