#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "json"
require "optparse"
require_relative "../build-data"
require_relative "index-files"
require_relative "download-index"

# Providers supply object download commands/SDKs, but do not install Mapshot's
# hash-pinned source bundle or produce its verified image COPY recipe. Ruby owns
# those transactions and calls the app-owned adapter only for domain validation.
class MapshotIndexes
  #: (?application_root: String, ?data: MapshotBuildData?, ?download: MapshotIndexDownload?) -> void
  def initialize(application_root: File.expand_path("../..", __dir__), data: nil, download: nil)
    @_application_root = application_root
    @_data = data || MapshotBuildData.new(application_root: application_root)
    @_download = download
  end

  #: (arguments: Array[String], ?output: IO | StringIO) -> void
  def run(arguments:, output: $stdout)
    options = {}
    OptionParser.new do |parser|
      parser.on("--mode MODE", ["fetch", "verify", "container"]) { |value| options["mode"] = value }
      ["bucket", "manifest-key", "manifest-sha256", "output", "directory"].each do |name|
        parser.on("--#{name} VALUE") { |value| options[name] = value }
      end
    end.parse!(arguments)
    raise ArgumentError, "Unexpected index command arguments." unless arguments.empty?

    root = options["directory"] || options["output"]
    raise ArgumentError, "Provide an index directory." unless root && !root.empty?

    result = case options.fetch("mode")
    when "fetch"
      install(bucket: options.fetch("bucket"), manifest_key: options.fetch("manifest-key"), sha256: options.fetch("manifest-sha256"), root: root)
      {"status" => "verified"}
    when "verify"
      verify(root: root)
      {"status" => "verified"}
    when "container"
      write_container_dockerfile(root: root)
      {"status" => "prepared", "dockerfile" => ".source-indexes.Dockerfile"}
    else
      raise ArgumentError, "Unsupported index command."
    end
    output.puts(JSON.generate(result))
  end

  #: (bucket: String, manifest_key: String, sha256: String, root: String) -> void
  def install(bucket:, manifest_key:, sha256:, root:)
    _install(bucket: bucket, manifest_key: manifest_key, sha256: sha256, root: root)
    nil
  end

  #: (bucket: String, manifest_key: String, sha256: String, root: String) -> void
  def install_for_container(bucket:, manifest_key:, sha256:, root:)
    parsed = _install(bucket: bucket, manifest_key: manifest_key, sha256: sha256, root: root)
    _write_container_dockerfile(files: MapshotIndexFiles.new(root: root), parsed: parsed)
  end

  #: (root: String, ?sha256: String?) -> void
  def verify(root:, sha256: nil)
    files = MapshotIndexFiles.new(root: root)
    _verify(files: files, parsed: _manifest(files: files, expected_sha256: sha256))
  end

  #: (root: String) -> void
  def write_container_dockerfile(root:)
    files = MapshotIndexFiles.new(root: root)
    parsed = _manifest(files: files)
    _verify(files: files, parsed: parsed)
    _write_container_dockerfile(files: files, parsed: parsed)
  end

  private

  #: (bucket: String, manifest_key: String, sha256: String, root: String) -> Hash[String, Object]
  def _install(bucket:, manifest_key:, sha256:, root:)
    download = @_download || MapshotIndexDownload.from_environment(application_root: @_application_root)
    MapshotIndexFiles.install(root: root) do |files|
      download.download(bucket: bucket, key: manifest_key, destination: files.destination(path: "manifest.json"))
      parsed = _manifest(files: files, expected_sha256: sha256)
      manifest = parsed.fetch("manifest")
      unless manifest_key == "source/indexes/v1/#{manifest.fetch('archive').fetch('id')}/#{sha256}/manifest.json"
        raise MapshotIndexFiles::IntegrityFailure, "Mapshot manifest identity does not match its key."
      end

      files.prepare_downloads
      parsed.fetch("files").each_slice(8) do |batch|
        threads = batch.map do |file|
          Thread.new do
            download.download(bucket: bucket, key: "source/indexes/v1/#{file.fetch('path')}",
              destination: files.destination(path: file.fetch("path")), maximum_bytes: file.fetch("bytes"))
          end.tap { |thread| thread.report_on_exception = false }
        end
        # Wait for every download before abandoning its staging directory.
        failures = threads.filter_map do |thread|
          thread.value
          nil
        rescue StandardError => error
          error
        end
        raise failures.first unless failures.empty?
      end
      landmarks = manifest.fetch("landmarks")
      download.download(bucket: bucket, key: landmarks.fetch("key"), destination: files.destination(path: "landmarks.pmtiles"), maximum_bytes: landmarks.fetch("bytes"))
      _verify(files: files, parsed: parsed)
      parsed
    end
  end

  #: (files: MapshotIndexFiles, parsed: Hash[String, Object]) -> void
  def _verify(files:, parsed:)
    manifest = parsed.fetch("manifest")
    landmarks = manifest.fetch("landmarks")
    files.verify_file(path: "landmarks.pmtiles", bytes: landmarks.fetch("bytes"), sha256: landmarks.fetch("sha256"))
    parsed.fetch("files").each do |file|
      files.verify_file(path: file.fetch("path"), bytes: file.fetch("bytes"), sha256: file.fetch("sha256"))
    end
    nil
  end

  #: (files: MapshotIndexFiles, parsed: Hash[String, Object]) -> void
  def _write_container_dockerfile(files:, parsed:)
    source = files.build_context_path(workspace_root: File.expand_path("../..", @_application_root))
    manifest = parsed.fetch("manifest")
    inputs = [*parsed.fetch("files"), {"path" => "landmarks.pmtiles", "bytes" => manifest.fetch("landmarks").fetch("bytes")},
      {"path" => "manifest.json", "bytes" => parsed.fetch("bytes")}]
    copy = []
    ["files/", ""].each do |directory|
      batch = []
      length = 0
      siblings = inputs.select { |file| file.fetch("path").start_with?(directory) && !file.fetch("path").delete_prefix(directory).include?("/") }
      siblings.each do |file|
        if !batch.empty? && (length + file.fetch("bytes") > 64 * 1024 * 1024 || batch.length >= 64)
          copy << "COPY --chown=root:root #{JSON.generate([*batch, "/app/data/indexes/#{directory}"])}"
          batch = []
          length = 0
        end
        batch << "#{source}/#{file.fetch('path')}"
        length += file.fetch("bytes")
      end
      copy << "COPY --chown=root:root #{JSON.generate([*batch, "/app/data/indexes/#{directory}"])}" unless batch.empty?
    end
    dockerfile = File.read(File.join(@_application_root, "Dockerfile"), encoding: "UTF-8")
    File.write(File.join(@_application_root, ".source-indexes.Dockerfile"),
      "#{dockerfile.rstrip}\n\n# Verified PMTiles directories and worldwide landmarks; basemap tile bodies remain in R2.\n#{copy.join("\n")}\n")
    nil
  end

  #: (files: MapshotIndexFiles, ?expected_sha256: String?) -> Hash[String, Object]
  def _manifest(files:, expected_sha256: nil)
    bytes = files.read(path: "manifest.json")
    if expected_sha256 && Digest::SHA256.hexdigest(bytes) != expected_sha256
      raise MapshotIndexFiles::IntegrityFailure, "Mapshot manifest integrity check failed."
    end
    text = bytes.dup.force_encoding(Encoding::UTF_8)
    raise MapshotIndexFiles::IntegrityFailure, "Mapshot manifest encoding is invalid." unless text.valid_encoding?

    parsed = @_data.validate(kind: "index-manifest", value: JSON.parse(text.delete_prefix("\uFEFF")))
    parsed.merge("bytes" => bytes.bytesize)
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    MapshotIndexes.new.run(arguments: ARGV)
  rescue StandardError
    warn "Map index command failed; no unverified bundle was activated."
    exit 1
  end
end
