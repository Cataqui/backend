#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "optparse"
require "tempfile"
require "tmpdir"
require_relative "../container/build-command"
require_relative "../build-data"
require_relative "../indexes/manage-indexes"

# Cloudflare builds/pushes images and bundles Workers, but does not return the
# retained, source-pinned Worker archive required by Mapshot recovery. Ruby owns
# that packaging. Its Ruby index builder reuses the application's authoritative
# data contracts through a narrow adapter.
class MapshotImageBuild
  #: (?application_root: String, ?commands: MapshotBuildCommand, ?data: MapshotBuildData?, ?indexes: MapshotIndexes?) -> void
  def initialize(application_root: File.expand_path("../..", __dir__), commands: MapshotBuildCommand.new, data: nil, indexes: nil)
    @_application_root = application_root
    @_commands = commands
    @_data = data || MapshotBuildData.new(application_root: application_root)
    @_indexes = indexes || MapshotIndexes.new(application_root: application_root, data: @_data)
  end

  #: (arguments: Array[String], input: IO) -> void
  def run(arguments:, input:)
    output = nil
    OptionParser.new do |parser|
      parser.banner = "Usage: ruby build/image/build-image.rb --output PRIVATE_JSON < INPUT_JSON"
      parser.on("--output PATH") { |value| output = value }
    end.parse!(arguments)
    raise ArgumentError, "Provide a private output file." unless output && arguments.empty?

    values = JSON.parse(input.read)
    result = build_and_publish(
      environment: values.fetch("environment"), account_id: values.fetch("accountId"), source: values.fetch("source"),
      operation: values.fetch("operation"), worker_path: values.fetch("workerPath")
    )
    File.open(output, File::WRONLY | File::CREAT | File::TRUNC | File::NOFOLLOW, 0o600) do |file|
      file.chmod(0o600)
      file.write(JSON.generate(result))
    end
  end

  #: (environment: String, account_id: String, source: Hash[String, Object], operation: String, worker_path: String) -> Hash[String, Object]
  def build_and_publish(environment:, account_id:, source:, operation:, worker_path:)
    raise ArgumentError, "Select staging or production." unless ["staging", "production"].include?(environment)
    raise ArgumentError, "Mapshot account ID is invalid." unless account_id.match?(/\A[a-f0-9]{32}\z/)
    raise ArgumentError, "Mapshot operation is invalid." unless operation.match?(/\A[a-f0-9]{64}\z/)
    raise ArgumentError, "Mapshot Worker destination must be absolute." unless File.absolute_path?(worker_path)

    source = @_data.validate(kind: "source", value: source)
    root = @_application_root
    indexes = File.join(root, "generated/source-indexes/image")
    dockerfile = File.join(root, ".source-indexes.Dockerfile")
    output = File.join(root, "worker/.cloudflare/output")
    _remove(path: indexes)
    begin
      @_indexes.install_for_container(
        bucket: "cataqui-mapshot-#{environment}", manifest_key: source.fetch("prepared").fetch("manifestKey"),
        sha256: source.fetch("prepared").fetch("sha256"), root: indexes
      )
      File.write(File.join(indexes, "source.json"), JSON.generate(source))
      File.open(dockerfile, "a") do |file|
        file.puts('COPY --chown=root:root ["apps/mapshot/generated/source-indexes/image/source.json", "/app/data/indexes/source.json"]')
      end
      tag = "cataqui-mapshot-#{environment}:#{operation}"
      @_commands.run(command: "docker", args: [
                       "build", "--platform", "linux/amd64", "--provenance=false", "-f", dockerfile, "-t", tag, "."
                     ], cwd: File.expand_path("../..", root))
      @_commands.run(command: "pnpm", args: ["--dir", "worker", "exec", "cf", "containers", "push", "--tag", tag], cwd: root)
      registry = "registry.cloudflare.com/#{account_id}/cataqui-mapshot-#{environment}"
      digests = JSON.parse(@_commands.run(command: "docker", args: [
                                            "image", "inspect", "registry.cloudflare.com/#{account_id}/#{tag}", "--format", "{{json .RepoDigests}}"
                                          ], cwd: root, capture_output: true))
      unless digests.is_a?(Array) && digests.all? { |digest| digest.is_a?(String) && digest.match?(/\A[^\s]+@sha256:[a-f0-9]{64}\z/) }
        raise "Published Mapshot image references are invalid."
      end
      image = digests.find { |digest| digest.start_with?("#{registry}@") }
      raise "Published Mapshot image has no immutable digest." unless image
      @_commands.run(command: "pnpm", args: ["build:contracts"], cwd: root)
      worker = Dir.mktmpdir("mapshot-artifact-") do |directory|
        archive = File.join(directory, "worker.tar.gz")
        _remove(path: output)
        @_commands.run(command: "pnpm", args: [
                         "--dir", "worker", "exec", "cf", "build", "--mode", environment
                       ], cwd: root, env: {"MAPSHOT_CONTAINER_IMAGE" => image})
        @_commands.run(command: "tar", args: ["-czf", archive, ".cloudflare/output"], cwd: File.join(root, "worker"))
        # Stage beside the caller's private destination before rename, including
        # when the system temporary directory is on a different filesystem.
        Tempfile.create(["mapshot-worker-", ".tar.gz"], File.dirname(worker_path)) do |file|
          File.open(archive, "rb") { |input| IO.copy_stream(input, file) }
          file.flush
          File.rename(file.path, worker_path)
        end
        {"path" => worker_path, "sha256" => Digest::SHA256.file(worker_path).hexdigest}
      end
      {"image" => image, "worker" => worker}
    ensure
      [indexes, dockerfile, output].each { |path| _remove(path: path) }
    end
  end

  private

  #: (path: String) -> void
  def _remove(path:)
    FileUtils.rm_r(path)
  rescue Errno::ENOENT
    # Interrupted builds may have removed only some of their owned inputs.
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    MapshotImageBuild.new.run(arguments: ARGV, input: $stdin)
  rescue StandardError
    warn "Mapshot image build failed. Provider output was suppressed to protect credentials."
    exit 1
  end
end
