# frozen_string_literal: true

require "fileutils"
require "open3"
require "optparse"

# Cargo builds the executable; cargo-about emits selected license texts. The extra
# upstream notices are required in the retained native artifact as well.
class MapshotNativeEngineBuild
  class Failure < StandardError; end

  #: (args: Array[String]) -> Integer
  def self.run_cli(args:)
    options = {}
    OptionParser.new do |parser|
      parser.on("--engine-root PATH") { |value| options[:engine_root] = value }
      parser.on("--destination PATH") { |value| options[:destination] = value }
    end.parse!(args)
    raise OptionParser::MissingArgument, "--engine-root and --destination" unless options[:engine_root] && options[:destination]
    raise OptionParser::InvalidArgument, "Unexpected positional arguments." unless args.empty?

    new(**options).build
    0
  rescue OptionParser::ParseError, Failure, SystemCallError => error
    warn error.message
    1
  end

  #: (engine_root: String, destination: String) -> void
  def initialize(engine_root:, destination:)
    @_engine_root = engine_root
    @_destination = destination
  end

  #: () -> void
  def build
    _execute(args: ["cargo", "clean", "--package", "mapshot-renderer", "--release", "--locked"])
    _execute(args: ["cargo", "build", "--release", "--locked"])
    Dir.mkdir(@_destination)
    FileUtils.cp(File.join(@_engine_root, "target/release/mapshot-renderer"), File.join(@_destination, "mapshot-renderer"))
    licenses = File.join(@_destination, "licenses")
    Dir.mkdir(licenses)
    _execute(args: ["cargo-about", "generate", "--locked", "--fail", "notices.hbs", "--output-file", File.join(licenses, "THIRD_PARTY_NOTICES.txt")])
    sysroot, status = Open3.capture2("rustc", "--print", "sysroot", chdir: @_engine_root)
    raise Failure, "Mapshot native build command failed: rustc" unless status.success?

    FileUtils.cp(File.join(sysroot.strip, "share/doc/rust/COPYRIGHT-library.html"), File.join(licenses, "RUST-STANDARD-LIBRARY-COPYRIGHT.html"))
    registry = File.join(ENV.fetch("CARGO_HOME", File.expand_path("~/.cargo")), "registry/src")
    %w[
      memchr-2.8.3/COPYING
      siphasher-1.0.4/COPYING
      unicode-bidi-0.3.18/AUTHORS
      unicode-bidi-0.3.18/COPYRIGHT
      unicode-segmentation-1.13.3/COPYRIGHT
      libwebp-sys-0.14.4/vendor/COPYING
      libwebp-sys-0.14.4/vendor/PATENTS
    ].each do |notice|
      candidates = Dir.glob(File.join(registry, "*", notice))
      raise Failure, "Expected one upstream engine notice: #{notice}" unless candidates.length == 1

      destination = File.join(licenses, notice)
      FileUtils.mkdir_p(File.dirname(destination))
      FileUtils.cp(candidates.fetch(0), destination)
    end
    nil
  end

  private

  #: (args: Array[String]) -> void
  def _execute(args:)
    raise Failure, "Mapshot native build command failed: #{args.first}" unless system(*args, chdir: @_engine_root)
    nil
  end
end

exit(MapshotNativeEngineBuild.run_cli(args: ARGV)) if $PROGRAM_NAME == __FILE__
