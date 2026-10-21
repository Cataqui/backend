# frozen_string_literal: true

require_relative "../../test/test_helper"
require "fileutils"
require "json"
require "open3"
require "rbconfig"
require "tmpdir"
require_relative "build-engine"

class MapshotNativeEngineBuildTest < Minitest::Test
  NOTICES = %w[
    memchr-2.8.3/COPYING
    siphasher-1.0.4/COPYING
    unicode-bidi-0.3.18/AUTHORS
    unicode-bidi-0.3.18/COPYRIGHT
    unicode-segmentation-1.13.3/COPYRIGHT
    libwebp-sys-0.14.4/vendor/COPYING
    libwebp-sys-0.14.4/vendor/PATENTS
  ].freeze

  #: () -> void
  def setup
    @directory = Dir.mktmpdir("mapshot-native-build-", "/tmp")
    @engine = File.join(@directory, "engine")
    @destination = File.join(@directory, "output")
    @cargo_home = File.join(@directory, "cargo")
    @registry = File.join(@cargo_home, "registry/src")
    @bin = File.join(@directory, "bin")
    @sysroot = File.join(@directory, "sysroot")
    @calls = File.join(@directory, "calls.jsonl")
    [File.join(@engine, "target/release"), @bin, File.join(@sysroot, "share/doc/rust")].each { |path| FileUtils.mkdir_p(path) }
    File.binwrite(File.join(@engine, "target/release/mapshot-renderer"), [1, 2, 3, 4].pack("C*"))
    File.chmod(0o755, File.join(@engine, "target/release/mapshot-renderer"))
    File.write(File.join(@sysroot, "share/doc/rust/COPYRIGHT-library.html"), "rust notices\n")
    NOTICES.each do |notice|
      path = File.join(@registry, "upstream", notice)
      FileUtils.mkdir_p(File.dirname(path))
      File.write(path, "upstream notice #{notice}\n")
    end
    script = <<~'PROGRAM'
      #!/usr/bin/env ruby
      require 'json'
      File.open(ENV.fetch('MAPSHOT_TEST_CALLS'), 'a') { |file| file.puts(JSON.generate({'command' => File.basename($PROGRAM_NAME), 'args' => ARGV, 'cwd' => Dir.pwd})) }
      command = File.basename($PROGRAM_NAME)
      exit 7 if ENV['MAPSHOT_TEST_FAIL'] == command
      if command == 'rustc'
        puts ENV.fetch('MAPSHOT_TEST_SYSROOT')
      elsif command == 'cargo-about'
        File.write(ARGV.fetch(ARGV.index('--output-file') + 1), "selected license text\n")
      end
    PROGRAM
    %w[cargo rustc cargo-about].each do |command|
      path = File.join(@bin, command)
      File.write(path, script)
      File.chmod(0o700, path)
    end
    @original_env = ENV.to_h
    ENV["PATH"] = "#{@bin}:#{ENV.fetch('PATH')}"
    ENV["MAPSHOT_TEST_CALLS"] = @calls
    ENV["MAPSHOT_TEST_SYSROOT"] = @sysroot
    ENV["CARGO_HOME"] = @cargo_home
    @builder = MapshotNativeEngineBuild.new(engine_root: @engine, destination: @destination)
  end

  #: () -> void
  def teardown
    ENV.replace(@original_env)
    FileUtils.remove_entry(@directory)
  end

  #: () -> void
  def test_builds_locked_native_binary_and_preserves_every_required_notice
    @builder.build
    assert_equal [1, 2, 3, 4].pack("C*"), File.binread(File.join(@destination, "mapshot-renderer"))
    assert_equal 0o755, File.stat(File.join(@destination, "mapshot-renderer")).mode & 0o777
    assert_equal "selected license text\n", File.read(File.join(@destination, "licenses/THIRD_PARTY_NOTICES.txt"))
    assert_equal "rust notices\n", File.read(File.join(@destination, "licenses/RUST-STANDARD-LIBRARY-COPYRIGHT.html"))
    NOTICES.each do |notice|
      assert_equal "upstream notice #{notice}\n", File.read(File.join(@destination, "licenses", notice))
    end
    calls = File.readlines(@calls).map { |line| JSON.parse(line) }
    working_directory = File.realpath(@engine)
    assert_equal [
      {"command" => "cargo", "args" => ["clean", "--package", "mapshot-renderer", "--release", "--locked"], "cwd" => working_directory},
      {"command" => "cargo", "args" => ["build", "--release", "--locked"], "cwd" => working_directory},
      {"command" => "cargo-about", "args" => ["generate", "--locked", "--fail", "notices.hbs", "--output-file", File.join(@destination, "licenses/THIRD_PARTY_NOTICES.txt")], "cwd" => working_directory},
      {"command" => "rustc", "args" => ["--print", "sysroot"], "cwd" => working_directory}
    ], calls
  end

  #: () -> void
  def test_stops_before_packaging_when_cargo_fails
    ENV["MAPSHOT_TEST_FAIL"] = "cargo"
    assert_raises(MapshotNativeEngineBuild::Failure) { @builder.build }
    refute File.exist?(@destination)
    assert_equal 1, File.readlines(@calls).length
  end

  #: () -> void
  def test_does_not_accept_missing_or_ambiguous_upstream_notices
    missing = File.join(@registry, "upstream", NOTICES.first)
    File.delete(missing)
    assert_raises(MapshotNativeEngineBuild::Failure) { @builder.build }
    FileUtils.remove_entry(@destination)
    File.write(missing, "notice")
    duplicate = File.join(@registry, "duplicate", NOTICES.first)
    FileUtils.mkdir_p(File.dirname(duplicate))
    File.write(duplicate, "notice")
    assert_raises(MapshotNativeEngineBuild::Failure) { @builder.build }
  end

  #: () -> void
  def test_stops_when_captured_rustc_command_fails
    ENV["MAPSHOT_TEST_FAIL"] = "rustc"
    assert_raises(MapshotNativeEngineBuild::Failure) { @builder.build }
    refute File.exist?(File.join(@destination, "licenses/RUST-STANDARD-LIBRARY-COPYRIGHT.html"))
  end

  #: () -> void
  def test_cli_rejects_missing_options_before_running_cargo
    [[], ["--engine-root", @engine]].each do |args|
      _output, error = capture_io { assert_equal 1, MapshotNativeEngineBuild.run_cli(args: args) }
      assert_match(/--engine-root and --destination/, error)
    end
    refute File.exist?(@calls)
  end

  #: () -> void
  def test_cli_rejects_unexpected_or_unrecognized_arguments_before_running_cargo
    [["--invalid"], ["--engine-root", @engine, "--destination", @destination, "unexpected"]].each do |args|
      _output, error = capture_io { assert_equal 1, MapshotNativeEngineBuild.run_cli(args: args) }
      refute_empty error
    end
    refute File.exist?(@calls)
  end

  #: () -> void
  def test_cli_builds_the_selected_native_engine
    assert_equal 0, MapshotNativeEngineBuild.run_cli(args: ["--engine-root", @engine, "--destination", @destination])
    assert File.exist?(File.join(@destination, "mapshot-renderer"))
  end

  #: () -> void
  def test_cli_reports_a_missing_build_output_without_a_stack_trace
    File.delete(File.join(@engine, "target/release/mapshot-renderer"))
    _output, error = capture_io do
      assert_equal 1, MapshotNativeEngineBuild.run_cli(args: ["--engine-root", @engine, "--destination", @destination])
    end
    refute_match(/\.rb:\d+/, error)
    refute File.exist?(File.join(@destination, "licenses"))
  end

  #: () -> void
  def test_cli_reports_command_failure_without_a_stack_trace
    ENV["MAPSHOT_TEST_FAIL"] = "cargo"
    _output, error, status = Open3.capture3(RbConfig.ruby, File.join(__dir__, "build-engine.rb"), "--engine-root", @engine, "--destination", @destination)
    refute status.success?
    assert_match(/Mapshot native build command failed: cargo/, error)
    refute_match(/\.rb:\d+/, error)
    refute File.exist?(@destination)
  end
end
