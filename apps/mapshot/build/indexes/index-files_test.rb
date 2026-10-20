# frozen_string_literal: true

require_relative "../../test/test_helper"
require "digest"
require "fileutils"
require "json"
require "tmpdir"
require_relative "index-files"

class MapshotIndexFilesTest < Minitest::Test
  #: () -> void
  def setup
    @_directory = Dir.mktmpdir("mapshot-index-files-")
  end

  #: () -> void
  def teardown
    FileUtils.remove_entry(@_directory)
  end

  #: () -> void
  def test_publishes_complete_staged_directory_atomically_and_cleans_renamed_context
    destination = File.join(@_directory, "bundles/indexes")
    result = MapshotIndexFiles.install(root: destination) do |files|
      files.prepare_downloads
      File.write(files.destination(path: "files/index.body"), "body")
      refute_path_exists destination
      "verified"
    end
    assert_equal "verified", result
    assert_equal "body", File.read(File.join(destination, "files/index.body"))
    assert_equal ["indexes"], Dir.children(File.dirname(destination))
  end

  #: () -> void
  def test_removes_abandoned_staging_directory_without_exposing_destination
    destination = File.join(@_directory, "indexes")
    assert_raises(RuntimeError) do
      MapshotIndexFiles.install(root: destination) do |files|
        File.write(files.destination(path: "manifest.json"), "partial")
        raise "verification failed"
      end
    end
    assert_empty Dir.children(@_directory)
  end

  #: () -> void
  def test_never_replaces_existing_directory_file_or_symlink_destination
    ["directory", "file", "symlink"].each do |kind|
      destination = File.join(@_directory, kind)
      case kind
      when "directory" then Dir.mkdir(destination)
      when "file" then File.write(destination, "existing")
      when "symlink" then File.symlink(File.join(@_directory, "absent"), destination)
      end
      assert_raises(MapshotIndexFiles::InvalidResource) { MapshotIndexFiles.install(root: destination) { flunk "Must not install." } }
      assert File.lstat(destination)
    end
  end

  #: () -> void
  def test_does_not_replace_a_destination_created_while_downloads_were_in_progress
    destination = File.join(@_directory, "indexes")
    assert_raises(MapshotIndexFiles::InvalidResource) do
      MapshotIndexFiles.install(root: destination) do |files|
        File.write(files.destination(path: "manifest.json"), "new")
        Dir.mkdir(destination)
        File.write(File.join(destination, "manifest.json"), "existing")
      end
    end
    assert_equal "existing", File.read(File.join(destination, "manifest.json"))
    assert_equal ["indexes"], Dir.children(@_directory)
  end

  #: () -> void
  def test_stages_through_a_directory_symlink_using_its_canonical_parent
    owner = File.join(@_directory, "owner")
    Dir.mkdir(owner)
    File.symlink(owner, File.join(@_directory, "alias"))
    MapshotIndexFiles.install(root: File.join(@_directory, "alias/indexes")) do |files|
      assert files.root.start_with?("#{File.realpath(owner)}/")
      File.write(files.destination(path: "manifest.json"), "complete")
    end
    assert_equal "complete", File.read(File.join(owner, "indexes/manifest.json"))
  end

  #: () -> void
  def test_confines_download_destinations_to_the_bundle
    files = MapshotIndexFiles.new(root: @_directory)
    assert_equal File.join(files.root, "manifest.json"), files.destination(path: "manifest.json")
    ["", "..", "../sibling/body", files.root].each do |path|
      assert_raises(MapshotIndexFiles::InvalidResource) { files.destination(path: path) }
    end
  end

  #: () -> void
  def test_packages_only_a_strict_descendant_of_the_canonical_build_context
    indexes = File.join(@_directory, "generated/indexes")
    FileUtils.mkdir_p(File.join(indexes, "child"))
    Dir.mkdir(File.join(@_directory, "outside"))
    files = MapshotIndexFiles.new(root: indexes)
    assert_equal "generated/indexes", files.build_context_path(workspace_root: @_directory)
    [indexes, File.join(indexes, "child"), File.join(@_directory, "outside")].each do |workspace|
      assert_raises(MapshotIndexFiles::InvalidResource) { files.build_context_path(workspace_root: workspace) }
    end
  end

  #: () -> void
  def test_reads_and_hashes_files_in_bounded_chunks_before_packaging
    body = ("*" * (1024 * 1024)) + "additional bytes"
    path = File.join(@_directory, "landmarks.pmtiles")
    File.binwrite(path, body)
    files = MapshotIndexFiles.new(root: @_directory)
    files.verify_file(path: "landmarks.pmtiles", bytes: body.bytesize, sha256: Digest::SHA256.hexdigest(body))
    assert_equal body, files.read(path: "landmarks.pmtiles")
    assert_equal body.bytesize, files.stat(path: "landmarks.pmtiles")
    assert_raises(MapshotIndexFiles::IntegrityFailure) { files.stat(path: "landmarks.pmtiles", expected_bytes: body.bytesize + 1) }
    assert_raises(MapshotIndexFiles::IntegrityFailure) { files.verify_file(path: "landmarks.pmtiles", bytes: body.bytesize, sha256: "0" * 64) }
  end

  #: () -> void
  def test_rejects_file_and_parent_symlinks_and_non_regular_files
    files = MapshotIndexFiles.new(root: @_directory)
    owner = File.join(@_directory, "owner")
    Dir.mkdir(owner)
    File.write(File.join(owner, "body"), "body")
    File.symlink(owner, File.join(@_directory, "alias"))
    File.symlink(File.join(owner, "body"), File.join(@_directory, "body-link"))
    ["alias/body", "body-link", "owner"].each do |path|
      assert_raises(MapshotIndexFiles::IntegrityFailure) { files.read(path: path) }
    end
  end
end
