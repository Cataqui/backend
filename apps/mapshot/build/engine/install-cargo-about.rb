# frozen_string_literal: true

require "digest"
require "fileutils"
require "optparse"
require "rbconfig"
require "tmpdir"

# cargo-about publishes prebuilt releases, but has no command to install the
# exact archive and checksum pinned by this repository. curl and tar retain
# download and extraction ownership; Ruby selects and verifies that archive.
class MapshotCargoAboutInstallation
  class Failure < StandardError; end

  #: (args: Array[String]) -> Integer
  def self.run_cli(args:)
    options = {}
    OptionParser.new do |parser|
      parser.on("--engine-root DIRECTORY") { |value| options[:engine_root] = value }
      parser.on("--destination DIRECTORY") { |value| options[:destination] = value }
    end.parse!(args)
    raise OptionParser::MissingArgument, "--engine-root" unless options[:engine_root]
    raise OptionParser::InvalidArgument, "Unexpected positional arguments." unless args.empty?

    new(**options).install
    0
  rescue OptionParser::ParseError, Failure => error
    warn error.message
    1
  end

  #: (engine_root: String, ?destination: String) -> void
  def initialize(engine_root:, destination: "/usr/local/bin")
    @_engine_root = File.expand_path(engine_root)
    @_destination = File.expand_path(destination)
    @_architecture = {"x86_64" => "x86_64", "amd64" => "x86_64", "aarch64" => "aarch64", "arm64" => "aarch64"}[RbConfig::CONFIG.fetch("host_cpu")]
    raise Failure, "Unsupported cargo-about architecture." unless @_architecture
  end

  #: () -> void
  def install
    version = File.binread(File.join(@_engine_root, "cargo-about.version")).strip
    archive = "cargo-about-#{version}-#{@_architecture}-unknown-linux-musl.tar.gz"
    checksums = File.readlines(File.join(@_engine_root, "cargo-about.sha256"), mode: "rb", chomp: true).map do |line|
      line.split
    end
    checksum = checksums.find { |_, filename| filename == archive }&.first
    raise Failure, "Missing cargo-about archive checksum." unless checksum

    Dir.mktmpdir("mapshot-cargo-about-") do |directory|
      download = File.join(directory, archive)
      url = "https://github.com/EmbarkStudios/cargo-about/releases/download/#{version}/#{archive}"
      raise Failure, "cargo-about download failed." unless system("curl", "--fail", "--location", "--retry", "3", url, "--output", download)
      raise Failure, "cargo-about archive checksum mismatch." unless Digest::SHA256.file(download).hexdigest == checksum

      FileUtils.mkdir_p(@_destination)
      unless system("tar", "--extract", "--gzip", "--file", download, "--strip-components=1", "--directory", @_destination, "#{archive.delete_suffix(".tar.gz")}/cargo-about")
        raise Failure, "cargo-about extraction failed."
      end
    end
    nil
  rescue SystemCallError, IOError
    raise Failure, "Could not read or install the pinned cargo-about release."
  end
end

exit MapshotCargoAboutInstallation.run_cli(args: ARGV) if $PROGRAM_NAME == __FILE__
