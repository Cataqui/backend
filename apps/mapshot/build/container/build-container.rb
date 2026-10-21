#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"

# Docker provides the build stages and exports. This adapter only maps Mapshot's
# existing development commands to those stages and keeps the watch mounts exact.
class MapshotContainerBuild
  STAGES = {
    "tools" => "tooling-export",
    "renderer" => "runtime",
    "test" => "test",
    "coverage" => "coverage-export",
    "typecheck" => "typecheck",
    "watch" => "verification-environment",
    "native-test" => "native-test"
  }.freeze

  class CommandFailure < StandardError
    attr_reader :status

    #: (status: Process::Status) -> void
    def initialize(status:)
      @status = status
      super("Mapshot Docker command failed (#{status.termsig || status.exitstatus}).")
    end
  end

  #: (?application_root: String) -> void
  def initialize(application_root: File.expand_path("../..", __dir__))
    @_application_root = application_root
  end

  #: (task: String) -> void
  def build(task:)
    stage = STAGES.fetch(task) { raise ArgumentError, "Select a Mapshot Docker task: #{STAGES.keys.join(', ')}." }
    args = ["build"]
    args.concat(["--platform", "linux/amd64"]) if ["renderer", "native-test"].include?(task)
    args.concat(["--file", "apps/mapshot/Dockerfile", "--target", stage])
    case task
    when "tools"
      args.concat(["--output", "type=local,dest=#{@_application_root}"])
    when "coverage"
      args.concat(["--output", "type=local,dest=#{File.join(@_application_root, 'coverage')}"])
    when "watch"
      args.concat(["--tag", "cataqui-mapshot:watch"])
    else
      args.concat(["--output", "type=cacheonly"])
    end
    args << "."
    _run(args: args, cwd: File.expand_path("../..", @_application_root))
    return unless task == "watch"

    watch = ["run", "--rm", "--init", "-it"]
    ["src", "build", "scripts", "test", "renderer", "vitest.config.ts"].each do |path|
      watch.concat(["--mount", "type=bind,source=#{File.join(@_application_root, path)},target=/workspace/apps/mapshot/#{path},readonly"])
    end
    watch.concat(["--workdir", "/workspace/apps/mapshot", "cataqui-mapshot:watch", "pnpm", "exec", "vitest"])
    _run(args: watch, cwd: @_application_root)
    nil
  end

  private

  #: (args: Array[String], cwd: String) -> void
  def _run(args:, cwd:)
    system("docker", *args, chdir: cwd, exception: false)
    status = $?
    raise CommandFailure.new(status: status) unless status.success?
    nil
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    task = nil
    OptionParser.new do |parser|
      parser.banner = "Usage: ruby build/container/build-container.rb --task TASK"
      parser.on("--task TASK", MapshotContainerBuild::STAGES.keys) { |value| task = value }
    end.parse!
    raise ArgumentError, "Unexpected arguments: #{ARGV.join(' ')}" unless ARGV.empty?

    MapshotContainerBuild.new.build(task: task)
  rescue MapshotContainerBuild::CommandFailure => error
    warn error.message
    if error.status.signaled?
      Signal.trap(error.status.termsig, "DEFAULT")
      Process.kill(error.status.termsig, Process.pid)
    end
    exit(error.status.exitstatus || 1)
  rescue OptionParser::ParseError, ArgumentError, SystemCallError => error
    warn error.message
    exit 1
  end
end
