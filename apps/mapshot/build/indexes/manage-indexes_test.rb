# frozen_string_literal: true

require_relative "../../test/test_helper"
require "base64"
require "digest"
require "fileutils"
require "json"
require "stringio"
require "tmpdir"
require_relative "manage-indexes"

class MapshotIndexesTest < Minitest::Test
  class Data
    attr_reader :calls

    #: () -> void
    def initialize
      @_data = MapshotBuildData.new
      @calls = []
    end

    #: (kind: String, value: Hash[String, Object]) -> Hash[String, Object]
    def validate(kind:, value:)
      @calls << {kind: kind, value: value}
      @_data.validate(kind: kind, value: value)
    end
  end

  class Download
    attr_reader :calls, :maximum_active, :active
    attr_accessor :fail_key

    #: (objects: Hash[String, String]) -> void
    def initialize(objects:)
      @_objects = objects
      @_mutex = Mutex.new
      @calls = []
      @active = 0
      @maximum_active = 0
    end

    #: (bucket: String, key: String, destination: String, ?maximum_bytes: Integer) -> void
    def download(bucket:, key:, destination:, maximum_bytes: (2**53) - 1)
      @_mutex.synchronize do
        @calls << {bucket: bucket, key: key, destination: destination, maximum_bytes: maximum_bytes}
        @active += 1
        @maximum_active = [@maximum_active, @active].max
      end
      begin
        sleep 0.005
        if key == fail_key
          File.binwrite(destination, "partial")
          raise "Download failed."
        end

        bytes = @_objects.fetch(key)
        raise "Fixture exceeds download limit." if bytes.bytesize > maximum_bytes

        File.binwrite(destination, bytes)
      ensure
        @_mutex.synchronize { @active -= 1 }
      end
    end
  end

  #: () -> void
  def setup
    @_directory = Dir.mktmpdir("mapshot-index-install-")
    @_root = File.join(@_directory, "apps/mapshot")
    FileUtils.mkdir_p(File.join(@_root, "worker"))
    @_fixture = JSON.parse(File.read(File.join(__dir__, "fixtures/index-bundle.json")))
    @_objects = @_fixture.fetch("objects").transform_values { |value| Base64.strict_decode64(value) }
    @_manifest = @_fixture.fetch("manifest")
    @_manifest_key = @_fixture.fetch("manifestKey")
    @_sha256 = @_fixture.fetch("sha256")
    @_destination = File.join(@_root, "generated/indexes")
    @_download = Download.new(objects: @_objects)
    @_data = Data.new
    @_indexes = MapshotIndexes.new(application_root: @_root, data: @_data, download: @_download)
    File.write(File.join(@_root, "Dockerfile"), "FROM renderer\n\n")
  end

  #: () -> void
  def teardown
    FileUtils.remove_entry(@_directory)
  end

  #: () -> void
  def test_installs_only_pinned_files_after_integrity_verification
    _install
    assert_equal 4, @_download.calls.length
    assert_equal @_objects.fetch(@_manifest_key), File.binread(File.join(@_destination, "manifest.json"))
    files = [@_manifest.fetch("metadata").fetch("headerRoot"), *@_manifest.fetch("metadata").fetch("leaves").map { |leaf| leaf.fetch("file") }]
    files.each { |file| assert_equal @_objects.fetch("source/indexes/v1/#{file.fetch('path')}"), File.binread(File.join(@_destination, file.fetch("path"))) }
    assert_equal @_objects.fetch(@_manifest.fetch("landmarks").fetch("key")), File.binread(File.join(@_destination, "landmarks.pmtiles"))
    assert_raises(MapshotIndexFiles::InvalidResource) { _install }
  end

  #: () -> void
  def test_installs_and_reverifies_a_pinned_manifest_larger_than_eight_mebibytes
    body = @_objects.fetch(@_manifest_key) + ("\n" * (8 * 1024 * 1024))
    @_sha256 = Digest::SHA256.hexdigest(body)
    @_manifest_key = "source/indexes/v1/#{@_manifest.fetch('archive').fetch('id')}/#{@_sha256}/manifest.json"
    @_objects[@_manifest_key] = body

    _install

    assert_equal body.bytesize, File.size(File.join(@_destination, "manifest.json"))
    @_indexes.verify(root: @_destination)
  end

  #: () -> void
  def test_reverifies_a_landmark_archive_larger_than_one_gibibyte_using_its_declared_size_and_digest
    _install
    path = File.join(@_destination, "landmarks.pmtiles")
    bytes = (1024 * 1024 * 1024) + 1
    File.open(path, "wb") { |file| file.truncate(bytes) }
    @_manifest.fetch("landmarks").merge!("bytes" => bytes, "sha256" => Digest::SHA256.file(path).hexdigest)
    File.write(File.join(@_destination, "manifest.json"), JSON.generate(@_manifest))
    @_indexes.verify(root: @_destination)

    assert_equal bytes, File.size(path)
    assert_equal(["index-manifest", "index-manifest"], @_data.calls.map { |call| call.fetch(:kind) })
  end

  #: () -> void
  def test_corrupt_download_never_exposes_a_partial_bundle
    key = "source/indexes/v1/#{@_manifest.fetch('metadata').fetch('headerRoot').fetch('path')}"
    @_objects[key] = "corrupt"
    assert_raises(MapshotIndexFiles::IntegrityFailure) { _install }
    refute_path_exists @_destination
    assert_empty Dir.children(File.dirname(@_destination))
  end

  #: () -> void
  def test_corrupt_worldwide_archive_never_exposes_a_partial_bundle
    key = @_manifest.fetch("landmarks").fetch("key")
    @_objects.fetch(key).setbyte(0, 0)
    assert_raises(MapshotIndexFiles::IntegrityFailure) { _install }
    refute_path_exists @_destination
    assert_empty Dir.children(File.dirname(@_destination))
  end

  #: () -> void
  def test_manifest_hash_and_object_identity_are_verified_before_downloading_payloads
    assert_raises(MapshotIndexFiles::IntegrityFailure) do
      @_indexes.install(bucket: "owned-bucket", manifest_key: @_manifest_key, sha256: "f" * 64, root: @_destination)
    end
    assert_equal 1, @_download.calls.length
    other_key = @_manifest_key.sub(@_manifest.fetch("archive").fetch("id"), "f" * 64)
    @_objects[other_key] = @_objects.fetch(@_manifest_key)
    assert_raises(MapshotIndexFiles::IntegrityFailure) do
      @_indexes.install(bucket: "owned-bucket", manifest_key: other_key, sha256: @_sha256, root: @_destination)
    end
    assert_equal 2, @_download.calls.length
    refute_path_exists @_destination
  end

  #: () -> void
  def test_rejects_invalid_utf8_or_malformed_manifest_without_publishing
    ["\xff".b, "{"].each do |bytes|
      @_objects[@_manifest_key] = bytes
      assert_raises(StandardError) do
        @_indexes.install(bucket: "owned-bucket", manifest_key: @_manifest_key, sha256: Digest::SHA256.hexdigest(bytes), root: @_destination)
      end
      refute_path_exists @_destination
    end
  end

  #: () -> void
  def test_downloads_at_most_eight_unique_directory_chunks_concurrently
    _split_leaves
    _install
    assert_operator @_download.maximum_active, :<=, 8
    assert_operator @_download.maximum_active, :>, 1
    assert_operator @_download.calls.length, :>, 8
    assert_equal 0, @_download.active
  end

  #: () -> void
  def test_waits_for_failed_batch_downloads_before_removing_their_staging_directory
    _split_leaves
    @_download.fail_key = "source/indexes/v1/#{@_manifest.fetch('metadata').fetch('leaves').first.fetch('file').fetch('path')}"
    assert_raises(RuntimeError) { _install }
    assert_equal 0, @_download.active
    refute_path_exists @_destination
    assert_empty Dir.children(File.dirname(@_destination))
  end

  #: () -> void
  def test_revalidation_checks_current_downloaded_content_and_selected_manifest_identity
    _install
    path = File.join(@_destination, "landmarks.pmtiles")
    File.binwrite(path, "corrupt")
    assert_raises(MapshotIndexFiles::IntegrityFailure) { @_indexes.verify(root: @_destination) }
    File.binwrite(path, @_objects.fetch(@_manifest.fetch("landmarks").fetch("key")))
    @_indexes.verify(root: @_destination)
    assert_raises(MapshotIndexFiles::IntegrityFailure) { @_indexes.verify(root: @_destination, sha256: "f" * 64) }
  end

  #: () -> void
  def test_writes_verified_index_dockerfile_without_reading_or_writing_worker_configuration
    _install
    @_indexes.write_container_dockerfile(root: @_destination)
    dockerfile = File.read(File.join(@_root, ".source-indexes.Dockerfile"))
    assert dockerfile.start_with?("FROM renderer\n\n# Verified PMTiles directories and worldwide landmarks; basemap tile bodies remain in R2.\n")
    assert_includes dockerfile, "/app/data/indexes/files/"
    assert_includes dockerfile, "apps/mapshot/generated/indexes/landmarks.pmtiles"
    assert_includes dockerfile, "COPY --chown=root:root"
  end

  #: () -> void
  def test_installs_and_writes_dockerfile_in_one_operation_with_one_manifest_parse
    result = @_indexes.install_for_container(bucket: "owned-bucket", manifest_key: @_manifest_key,
      sha256: @_sha256, root: @_destination)
    assert_equal(["index-manifest"], @_data.calls.map { |call| call.fetch(:kind) })
    assert_nil result
    assert_path_exists File.join(@_root, ".source-indexes.Dockerfile")
    assert_equal 4, @_download.calls.length
  end

  #: () -> void
  def test_standalone_dockerfile_writer_checks_existing_payloads_before_writing
    _install
    before = @_data.calls.length
    @_indexes.write_container_dockerfile(root: @_destination)
    assert_equal(["index-manifest"], @_data.calls.drop(before).map { |call| call.fetch(:kind) })
    File.write(File.join(@_destination, "landmarks.pmtiles"), "corrupted archive")
    assert_raises(MapshotIndexFiles::IntegrityFailure) { @_indexes.write_container_dockerfile(root: @_destination) }
  end

  #: () -> void
  def test_bounds_copy_layers_to_sixty_four_files_and_sixty_four_mebibytes
    _install
    offset = @_manifest.fetch("metadata").fetch("headerRoot").fetch("bytes")
    @_manifest.fetch("metadata")["leaves"] = 65.times.map do |index|
      bytes = index.to_s.ljust(1024 * 1024, "\0")
      sha256 = Digest::SHA256.hexdigest(bytes)
      path = "files/#{sha256}.body"
      File.binwrite(File.join(@_destination, path), bytes)
      leaf = {"originalOffset" => offset, "file" => {"path" => path, "bytes" => bytes.bytesize, "sha256" => sha256}}
      offset += bytes.bytesize
      leaf
    end
    @_manifest.fetch("archive")["bytes"] = offset
    landmarks = File.join(@_destination, "landmarks.pmtiles")
    File.open(landmarks, "wb") { |file| file.truncate(316 * 1024 * 1024) }
    @_manifest.fetch("landmarks").merge!("bytes" => File.size(landmarks), "sha256" => Digest::SHA256.file(landmarks).hexdigest)
    File.write(File.join(@_destination, "manifest.json"), JSON.generate(@_manifest))
    @_indexes.write_container_dockerfile(root: @_destination)
    copy = File.readlines(File.join(@_root, ".source-indexes.Dockerfile")).filter_map do |line|
      JSON.parse(line.delete_prefix("COPY --chown=root:root ")) if line.start_with?("COPY --chown=root:root ")
    end
    directory = copy.select { |layer| layer.last == "/app/data/indexes/files/" }
    assert_equal([64, 2], directory.map { |layer| layer.length - 1 })
    worldwide = copy.find { |layer| layer.any? { |path| path.end_with?("landmarks.pmtiles") } }
    assert_equal 2, worldwide.length
    refute(worldwide.any? { |path| path.end_with?("manifest.json") })
  end

  #: () -> void
  def test_rejects_indexes_outside_the_build_context
    _install
    Dir.mktmpdir("mapshot-index-outside-") do |directory|
      other = File.join(directory, "indexes")
      FileUtils.cp_r(@_destination, other)
      assert_raises(MapshotIndexFiles::InvalidResource) { @_indexes.write_container_dockerfile(root: other) }
    end
  end

  #: () -> void
  def test_cli_fetch_verify_and_container_preserve_public_json_outputs
    output = StringIO.new
    @_indexes.run(arguments: ["--mode", "fetch", "--bucket", "owned-bucket", "--manifest-key", @_manifest_key,
      "--manifest-sha256", @_sha256, "--output", @_destination], output: output)
    assert_equal "verified", JSON.parse(output.string).fetch("status")
    output = StringIO.new
    @_indexes.run(arguments: ["--mode", "verify", "--directory", @_destination], output: output)
    assert_equal "verified", JSON.parse(output.string).fetch("status")
    output = StringIO.new
    @_indexes.run(arguments: ["--mode", "container", "--directory", @_destination], output: output)
    assert_equal({"status" => "prepared", "dockerfile" => ".source-indexes.Dockerfile"}, JSON.parse(output.string))
  end

  #: () -> void
  def test_cli_requires_hash_pin_and_rejects_unknown_modes_and_positionals
    [["--mode", "fetch", "--bucket", "owned-bucket", "--manifest-key", @_manifest_key, "--output", @_destination],
      ["--mode", "unknown", "--output", @_destination],
      ["--mode", "container", "--directory", @_destination, "--environment", "preview"],
      ["--mode", "verify"],
      ["--directory", @_destination],
      ["--mode", "verify", "--directory", @_destination, "unexpected"]].each do |arguments|
      assert_raises(StandardError) { @_indexes.run(arguments: arguments, output: StringIO.new) }
    end
    assert_empty @_download.calls
  end

  private

  #: () -> void
  def _install
    @_indexes.install(bucket: "owned-bucket", manifest_key: @_manifest_key, sha256: @_sha256, root: @_destination)
  end

  #: () -> void
  def _split_leaves
    leaf = @_manifest.fetch("metadata").fetch("leaves").first
    bytes = @_objects.fetch("source/indexes/v1/#{leaf.fetch('file').fetch('path')}")
    @_manifest.fetch("metadata")["leaves"] = 9.times.map do |index|
      start = (index * bytes.bytesize) / 9
      finish = ((index + 1) * bytes.bytesize) / 9
      body = bytes.byteslice(start...finish)
      sha256 = Digest::SHA256.hexdigest(body)
      path = "files/#{sha256}.body"
      @_objects["source/indexes/v1/#{path}"] = body
      {"originalOffset" => leaf.fetch("originalOffset") + start, "file" => {"path" => path, "sha256" => sha256, "bytes" => body.bytesize}}
    end
    body = JSON.generate(@_manifest)
    @_sha256 = Digest::SHA256.hexdigest(body)
    @_manifest_key = "source/indexes/v1/#{@_manifest.fetch('archive').fetch('id')}/#{@_sha256}/manifest.json"
    @_objects[@_manifest_key] = body
  end
end
