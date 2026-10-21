# frozen_string_literal: true

require "digest"
require "fileutils"
require "tmpdir"

# Owns atomic installation and confined reads; runtime map schemas and
# PMTiles readers remain authoritative for the contents of a verified bundle.
class MapshotIndexFiles
  class InvalidResource < StandardError; end
  class IntegrityFailure < StandardError; end

  attr_reader :root

  #: (root: String) -> void
  def initialize(root:)
    @root = File.realpath(root)
  end

  #: [Result] (root: String) { (MapshotIndexFiles) -> Result } -> Result
  def self.install(root:)
    requested = File.expand_path(root)
    FileUtils.mkdir_p(File.dirname(requested))
    destination = File.join(File.realpath(File.dirname(requested)), File.basename(requested))
    _assert_absent(path: destination)
    temporary = Dir.mktmpdir("#{File.basename(destination)}.install-", File.dirname(destination))
    begin
      result = yield new(root: temporary)
      _assert_absent(path: destination)
      File.rename(temporary, destination)
      result
    ensure
      begin
        FileUtils.remove_entry(temporary)
      rescue Errno::ENOENT
        # Successful publication has already renamed the temporary directory.
      end
    end
  end

  #: (path: String) -> void
  def self._assert_absent(path:)
    File.lstat(path)
    raise InvalidResource, "Mapshot index destination already exists."
  rescue Errno::ENOENT
    nil
  end
  private_class_method :_assert_absent

  #: (path: String) -> String
  def destination(path:)
    target = File.expand_path(path, root)
    raise InvalidResource, "Mapshot index path is outside its bundle." unless target.start_with?("#{root}/")

    target
  end

  #: () -> void
  def prepare_downloads
    Dir.mkdir(destination(path: "files"))
  end

  #: (path: String, ?expected_bytes: Integer?) -> Integer
  def stat(path:, expected_bytes: nil)
    target = destination(path: path)
    parent = File.dirname(target)
    until parent == root
      info = File.lstat(parent)
      raise IntegrityFailure, "Mapshot index parent is invalid." unless info.directory?

      parent = File.dirname(parent)
    end
    info = File.lstat(target)
    unless info.file? &&
        (expected_bytes.nil? || info.size == expected_bytes) && File.realpath(target).start_with?("#{root}/")
      raise IntegrityFailure, "Mapshot index file is invalid."
    end

    info.size
  end

  #: (path: String) -> String
  def read(path:)
    size = stat(path: path)
    File.open(destination(path: path), File::RDONLY | File::NOFOLLOW) do |file|
      raise IntegrityFailure, "Mapshot index file changed." unless file.stat.file? && file.stat.size == size

      bytes = file.read(size)
      unless bytes && bytes.bytesize == size && file.stat.size == size
        raise IntegrityFailure, "Mapshot index read is incomplete."
      end

      bytes
    end
  end

  #: (path: String, bytes: Integer, sha256: String) -> void
  def verify_file(path:, bytes:, sha256:)
    stat(path: path, expected_bytes: bytes)
    File.open(destination(path: path), File::RDONLY | File::NOFOLLOW) do |file|
      raise IntegrityFailure, "Mapshot index file changed." unless file.stat.file? && file.stat.size == bytes

      hash = Digest::SHA256.new
      length = 0
      while length < bytes
        chunk = file.read([1024 * 1024, bytes - length].min)
        raise IntegrityFailure, "Mapshot index read is incomplete." unless chunk && !chunk.empty?

        length += chunk.bytesize
        hash.update(chunk)
      end
      unless file.stat.size == bytes && hash.hexdigest == sha256
        raise IntegrityFailure, "Mapshot index integrity check failed."
      end
    end
  end

  #: (workspace_root: String) -> String
  def build_context_path(workspace_root:)
    workspace = File.realpath(workspace_root)
    raise InvalidResource, "Mapshot indexes must be inside the image build context." unless root.start_with?("#{workspace}/")

    root.delete_prefix("#{workspace}/")
  end
end
