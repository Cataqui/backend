# frozen_string_literal: true

require_relative "../../test/test_helper"
require "digest"
require "fileutils"
require "json"
require "rbconfig"
require "tmpdir"
require_relative "install-cargo-about"

class MapshotCargoAboutInstallationTest < Minitest::Test
  #: () -> void
  def setup
    @directory = Dir.mktmpdir("mapshot-cargo-about-test-", "/tmp")
    @engine_root = File.join(@directory, "engine")
    @destination = File.join(@directory, "installed tools")
    @commands = File.join(@directory, "commands.jsonl")
    @bin = File.join(@directory, "bin")
    @original_environment = ENV.to_h
    @original_host_cpu = RbConfig::CONFIG.fetch("host_cpu")
    RbConfig::CONFIG["host_cpu"] = "x86_64"
    FileUtils.mkdir_p([@engine_root, @bin])
    File.write(File.join(@engine_root, "cargo-about.version"), "0.9.2\n")
    File.write(File.join(@engine_root, "cargo-about.sha256"), "#{_checksum_line(architecture: 'aarch64')}\n#{_checksum_line(architecture: 'x86_64')}\n")
    _write_command(name: "curl", contents: <<~'RUBY')
      require "json"
      File.open(ENV.fetch("MAPSHOT_TEST_COMMANDS"), "a") { |file| file.puts(JSON.generate(["curl", *ARGV])) }
      exit ENV.fetch("MAPSHOT_TEST_CURL_EXIT", "0").to_i unless ENV.fetch("MAPSHOT_TEST_CURL_EXIT", "0") == "0"
      File.binwrite(ARGV.fetch(ARGV.index("--output") + 1), "archive fixture")
    RUBY
    _write_command(name: "tar", contents: <<~'RUBY')
      require "json"
      File.open(ENV.fetch("MAPSHOT_TEST_COMMANDS"), "a") { |file| file.puts(JSON.generate(["tar", *ARGV])) }
      exit ENV.fetch("MAPSHOT_TEST_TAR_EXIT", "0").to_i unless ENV.fetch("MAPSHOT_TEST_TAR_EXIT", "0") == "0"
      File.write(File.join(ARGV.fetch(ARGV.index("--directory") + 1), "cargo-about"), "installed binary")
    RUBY
    ENV["PATH"] = "#{@bin}:#{ENV.fetch("PATH")}"
    ENV["TMPDIR"] = "/tmp"
    ENV["MAPSHOT_TEST_COMMANDS"] = @commands
  end

  #: () -> void
  def teardown
    RbConfig::CONFIG["host_cpu"] = @original_host_cpu
    ENV.replace(@original_environment)
    FileUtils.remove_entry(@directory)
  end

  #: () -> void
  def test_installs_the_selected_pinned_archive_with_supported_curl_and_tar_options
    assert_nil _installation.install
    installed = File.join(@destination, "cargo-about")
    assert_equal "installed binary", File.read(installed)
    curl, tar = _commands
    archive = "cargo-about-0.9.2-x86_64-unknown-linux-musl.tar.gz"
    assert_equal ["curl", "--fail", "--location", "--retry", "3", "https://github.com/EmbarkStudios/cargo-about/releases/download/0.9.2/#{archive}", "--output"], curl[0...-1]
    assert_equal ["tar", "--extract", "--gzip", "--file", curl.last, "--strip-components=1", "--directory", @destination, "cargo-about-0.9.2-x86_64-unknown-linux-musl/cargo-about"], tar
    refute_path_exists File.dirname(curl.last)
  end

  #: () -> void
  def test_normalizes_supported_host_cpu_names_and_selects_the_exact_architecture_checksum
    {"aarch64" => "aarch64", "arm64" => "aarch64", "amd64" => "x86_64", "x86_64" => "x86_64"}.each do |host, target|
      FileUtils.rm_f(@commands)
      RbConfig::CONFIG["host_cpu"] = host
      _installation.install
      assert_includes _commands.first[5], "-#{target}-unknown-linux-musl.tar.gz"
    end
  end

  #: () -> void
  def test_rejects_an_unsupported_architecture_before_running_commands
    RbConfig::CONFIG["host_cpu"] = "riscv64"
    assert_raises(MapshotCargoAboutInstallation::Failure) { _installation }
    refute_path_exists @commands
  end

  #: () -> void
  def test_rejects_a_missing_pin_before_running_commands
    FileUtils.rm(File.join(@engine_root, "cargo-about.version"))
    assert_raises(MapshotCargoAboutInstallation::Failure) { _installation.install }
    refute_path_exists @commands
  end

  #: () -> void
  def test_requires_a_checksum_for_the_selected_release_before_downloading
    ["invalid\n", "#{'a' * 64}  other.tar.gz\n"].each do |contents|
      File.write(File.join(@engine_root, "cargo-about.sha256"), contents)
      assert_raises(MapshotCargoAboutInstallation::Failure) { _installation.install }
      refute_path_exists @commands
    end
  end

  #: () -> void
  def test_rejects_an_archive_with_the_wrong_checksum_and_cleans_the_download
    File.write(File.join(@engine_root, "cargo-about.sha256"), "#{'a' * 64}  cargo-about-0.9.2-x86_64-unknown-linux-musl.tar.gz\n")
    error = assert_raises(MapshotCargoAboutInstallation::Failure) { _installation.install }
    assert_match(/checksum mismatch/, error.message)
    assert_equal 1, _commands.length
    refute_path_exists File.dirname(_commands.first.last)
    refute_path_exists @destination
  end

  #: () -> void
  def test_rejects_a_failed_download_and_cleans_the_temporary_directory
    ENV["MAPSHOT_TEST_CURL_EXIT"] = "22"
    error = assert_raises(MapshotCargoAboutInstallation::Failure) { _installation.install }
    assert_match(/download failed/, error.message)
    assert_equal 1, _commands.length
    refute_path_exists File.dirname(_commands.first.last)
    refute_path_exists @destination
  end

  #: () -> void
  def test_rejects_a_failed_extraction_and_cleans_the_download
    ENV["MAPSHOT_TEST_TAR_EXIT"] = "2"
    error = assert_raises(MapshotCargoAboutInstallation::Failure) { _installation.install }
    assert_match(/extraction failed/, error.message)
    assert_equal 2, _commands.length
    refute_path_exists File.dirname(_commands.first.last)
  end

  #: () -> void
  def test_reports_invalid_cli_options_without_a_stack_trace
    [
      [["--invalid"], /invalid option/],
      [[], /missing argument.*--engine-root/],
      [["--engine-root"], /missing argument.*--engine-root/],
      [["--engine-root", @engine_root, "unexpected"], /Unexpected positional arguments/],
      [["--engine-root", File.join(@directory, "missing")], /Could not read or install/]
    ].each do |args, message|
      output, error = capture_io do
        assert_equal 1, MapshotCargoAboutInstallation.run_cli(args: args)
      end
      assert_empty output
      assert_match message, error
      refute_match(/\.rb:\d+/, error)
    end
    refute_path_exists @commands
  end

  #: () -> void
  def test_cli_process_exits_nonzero_with_a_concise_error
    output = IO.popen([RbConfig.ruby, File.join(__dir__, "install-cargo-about.rb"), "--invalid"], err: [:child, :out], &:read)
    refute $?.success?
    assert_match(/invalid option/, output)
    refute_match(/\.rb:\d+/, output)
  end

  #: () -> void
  def test_accepts_the_cli_engine_and_destination_options
    assert_equal 0, MapshotCargoAboutInstallation.run_cli(args: ["--engine-root", @engine_root, "--destination", @destination])
    assert_path_exists File.join(@destination, "cargo-about")
  end

  private

  #: () -> MapshotCargoAboutInstallation
  def _installation
    MapshotCargoAboutInstallation.new(engine_root: @engine_root, destination: @destination)
  end

  #: (name: String, contents: String) -> void
  def _write_command(name:, contents:)
    path = File.join(@bin, name)
    File.write(path, "#!#{RbConfig.ruby}\n#{contents}")
    FileUtils.chmod(0o755, path)
  end

  #: (architecture: String) -> String
  def _checksum_line(architecture:)
    "#{Digest::SHA256.hexdigest('archive fixture')}  cargo-about-0.9.2-#{architecture}-unknown-linux-musl.tar.gz"
  end

  #: () -> Array[Array[String]]
  def _commands
    File.readlines(@commands, chomp: true).map { |line| JSON.parse(line) }
  end
end
