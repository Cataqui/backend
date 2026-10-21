# frozen_string_literal: true

require_relative "../../../test/test_helper"
require "fileutils"
require_relative "source-import-file.repository"

class MapshotSourceImportFileRepositoryTest < Minitest::Test
  def setup
    @_directory = Dir.mktmpdir("mapshot-import-file-repository-")
    @_path = File.join(@_directory, "index.bin")
    File.binwrite(@_path, "\x00\x01\x02")
    @_repository = Cataqui::Mapshot::SourceImportFileRepository.new
  end

  def teardown
    FileUtils.remove_entry(@_directory)
  end

  def test_opens_a_binary_file_and_returns_raw_short_reads_and_end_of_file
    opened = nil
    result = @_repository.open(path: @_path) do |file|
      opened = file
      assert_equal "\x00\x01".b, @_repository.read_part(file: file, length: 2)
      assert_equal "\x02".b, @_repository.read_part(file: file, length: 2)
      assert_nil @_repository.read_part(file: file, length: 2)
      :finished
    end
    assert_equal :finished, result
    assert opened.closed?
  end

  def test_returns_raw_file_bytes_and_preserves_filesystem_failures
    assert_equal "\x00\x01".b, @_repository.read(path: @_path, length: 2)
    assert_raises(Errno::ENOENT) { @_repository.read(path: File.join(@_directory, "missing"), length: 1) }
  end

  def test_removes_owned_temporary_directories_after_success_and_failure
    created = nil
    result = @_repository.with_directory(prefix: "import-", parent: @_directory) do |path|
      created = path
      assert Dir.exist?(path)
      :finished
    end
    assert_equal :finished, result
    refute Dir.exist?(created)
    assert_raises(IOError) do
      @_repository.with_directory(prefix: "import-", parent: @_directory) do |path|
        created = path
        raise IOError, "failed"
      end
    end
    refute Dir.exist?(created)
  end
end
