# frozen_string_literal: true

require_relative "../../test/test_helper"
require "rbconfig"
require "tmpdir"
require_relative "build-command"

class MapshotBuildCommandTest < Minitest::Test
  #: () -> void
  def test_returns_stdout_without_mixing_stderr_or_executing_shell_syntax
    result = MapshotBuildCommand.new.run(
      command: RbConfig.ruby,
      args: ["-e", "STDOUT.write(ARGV.fetch(0)); STDERR.write('provider diagnostic')", "$(false); `exit 8`"],
      cwd: Dir.pwd,
      capture_output: true
    )
    assert_equal "$(false); `exit 8`", result
  end

  #: () -> void
  def test_suppresses_provider_failure_output_and_command_arguments
    error = assert_raises(MapshotBuildCommand::Failure) do
      MapshotBuildCommand.new.run(
        command: RbConfig.ruby,
        args: ["-e", "warn 'private provider output'; exit 7", "private argument"],
        cwd: Dir.pwd
      )
    end
    assert_match(/Provider output was suppressed/, error.message)
    refute_match(/private provider|private argument/, error.message)
  end

  #: () -> void
  def test_scopes_build_configuration_to_the_child_environment
    result = MapshotBuildCommand.new.run(
      command: RbConfig.ruby,
      args: ["-e", "STDOUT.write(ENV.fetch('MAPSHOT_CONTAINER_IMAGE'))"],
      cwd: Dir.pwd,
      capture_output: true,
      env: {"MAPSHOT_CONTAINER_IMAGE" => "registry.example.test/renderer@sha256:#{'a' * 64}"}
    )
    assert_equal "registry.example.test/renderer@sha256:#{'a' * 64}", result
    assert_nil ENV["MAPSHOT_CONTAINER_IMAGE"]
  end

  #: () -> void
  def test_discards_large_successful_build_logs_without_rejecting_the_command
    ["STDOUT", "STDERR"].each do |stream|
      assert_nil MapshotBuildCommand.new.run(
        command: RbConfig.ruby,
        args: ["-e", "65.times { #{stream}.write('x' * (1024 * 1024)) }"],
        cwd: Dir.pwd
      )
    end
  end

  #: () -> void
  def test_times_out_a_command_after_it_closes_its_output
    before = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    error = nil
    _expire_command_deadline_after_read do
      error = assert_raises(MapshotBuildCommand::Failure) do
        MapshotBuildCommand.new.run(
          command: RbConfig.ruby,
          args: ["-e", "STDOUT.close; STDERR.close; sleep 30"],
          cwd: Dir.pwd
        )
      end
    end
    assert_match(/timed out/, error.message)
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - before, :<, 10
  end

  #: () -> void
  def test_times_out_a_command_whose_descendant_keeps_the_output_open
    Dir.mktmpdir("mapshot-build-process-") do |directory|
      marker = File.join(directory, "descendant-completed")
      _expire_command_deadline_after_read do
        assert_raises(MapshotBuildCommand::Failure) do
          MapshotBuildCommand.new.run(
            command: RbConfig.ruby,
            args: ["-e", "fork { sleep 1; File.write(ARGV.fetch(0), 'unexpected') }; STDOUT.sync = true; puts 'started'; sleep 30", marker],
            cwd: directory
          )
        end
      end
      sleep 1.1
      refute_path_exists marker
    end
  end

  #: () -> void
  def test_suppresses_process_start_failures
    error = assert_raises(MapshotBuildCommand::Failure) do
      MapshotBuildCommand.new.run(command: "missing-mapshot-build-command", args: [], cwd: Dir.pwd)
    end
    assert_match(/Provider output was suppressed/, error.message)
  end

  private

  #: () { () -> void } -> void
  def _expire_command_deadline_after_read
    original_clock = Process.method(:clock_gettime)
    original_wait = IO.instance_method(:wait_readable)
    elapsed = 0
    waits = []
    Process.define_singleton_method(:clock_gettime) do |clock, *arguments|
      clock == Process::CLOCK_MONOTONIC ? elapsed : original_clock.call(clock, *arguments)
    end
    IO.define_method(:wait_readable) do |timeout|
      waits << timeout
      original_wait.bind_call(self, 5).tap { elapsed = 10 * 60 }
    end
    yield
    assert_equal [10 * 60], waits
  ensure
    Process.define_singleton_method(:clock_gettime, original_clock)
    IO.define_method(:wait_readable, original_wait)
  end
end
