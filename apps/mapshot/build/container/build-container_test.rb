# frozen_string_literal: true

require_relative "../../test/test_helper"
require "fileutils"
require "json"
require "open3"
require "rbconfig"
require "tmpdir"
require_relative "build-container"

class MapshotContainerBuildTest < Minitest::Test
  #: () -> void
  def setup
    @_directory = Dir.mktmpdir("mapshot-container-build-")
    @_application_root = File.join(@_directory, "apps/mapshot")
    @_calls = File.join(@_directory, "docker-calls.jsonl")
    FileUtils.mkdir_p(@_application_root)
    docker = File.join(@_directory, "docker")
    File.write(docker, <<~RUBY)
      #!#{RbConfig.ruby}
      require "json"
      File.open(ENV.fetch("MAPSHOT_TEST_DOCKER_CALLS"), "a") do |file|
        file.puts(JSON.generate({"args" => ARGV, "cwd" => Dir.pwd}))
      end
      exit ENV.fetch("MAPSHOT_TEST_DOCKER_STATUS", "0").to_i
    RUBY
    File.chmod(0o700, docker)
    @_environment = ENV.to_h
    ENV["PATH"] = "#{@_directory}:#{ENV.fetch('PATH')}"
    ENV["MAPSHOT_TEST_DOCKER_CALLS"] = @_calls
  end

  #: () -> void
  def teardown
    ENV.replace(@_environment)
    FileUtils.remove_entry(@_directory)
  end

  #: () -> void
  def test_maps_each_task_to_the_existing_stage_platform_and_export
    outputs = {
      "tools" => "type=local,dest=#{@_application_root}",
      "coverage" => "type=local,dest=#{@_application_root}/coverage"
    }
    MapshotContainerBuild::STAGES.reject { |task, _stage| task == "watch" }.each do |task, stage|
      builder = MapshotContainerBuild.new(application_root: @_application_root)
      builder.build(task: task)
      platform = ["renderer", "native-test"].include?(task) ? ["--platform", "linux/amd64"] : []
      call = JSON.parse(File.readlines(@_calls).last)
      assert_equal({
        "args" => ["build", *platform, "--file", "apps/mapshot/Dockerfile", "--target", stage,
          "--output", outputs.fetch(task, "type=cacheonly"), "."],
        "cwd" => File.realpath(@_directory)
      }, call)
    end
  end

  #: () -> void
  def test_watch_mounts_owned_sources_without_shadowing_image_dependencies
    builder = MapshotContainerBuild.new(application_root: @_application_root)
    builder.build(task: "watch")
    calls = File.readlines(@_calls).map { |line| JSON.parse(line) }
    assert_includes calls.first.fetch("args"), "cataqui-mapshot:watch"
    watch = calls.last
    assert_equal File.realpath(@_application_root), watch.fetch("cwd")
    assert_equal ["run", "--rm", "--init", "-it"], watch.fetch("args").first(4)
    ["src", "build", "scripts", "test", "renderer", "vitest.config.ts"].each do |path|
      assert_includes watch.fetch("args"), "type=bind,source=#{@_application_root}/#{path},target=/workspace/apps/mapshot/#{path},readonly"
    end
    refute_match(/node_modules|generated/, watch.fetch("args").join(" "))
    assert_equal ["--workdir", "/workspace/apps/mapshot", "cataqui-mapshot:watch", "pnpm", "exec", "vitest"], watch.fetch("args").last(6)
  end

  #: () -> void
  def test_watch_stops_when_the_build_fails
    ENV["MAPSHOT_TEST_DOCKER_STATUS"] = "7"
    builder = MapshotContainerBuild.new(application_root: @_application_root)
    error = assert_raises(MapshotContainerBuild::CommandFailure) { builder.build(task: "watch") }
    assert_equal 7, error.status.exitstatus
    assert_equal 1, File.readlines(@_calls).length
  end

  #: () -> void
  def test_invalid_or_missing_task_never_invokes_docker
    [nil, "invalid"].each do |task|
      builder = MapshotContainerBuild.new(application_root: @_application_root)
      assert_raises(ArgumentError) { builder.build(task: task) }
    end
    refute_path_exists @_calls
  end

  #: () -> void
  def test_cli_propagates_docker_failure_and_does_not_start_watch
    Dir.mktmpdir("mapshot-docker-command-") do |directory|
      executable = File.join(directory, "docker")
      File.write(executable, "#!/usr/bin/env ruby\nexit 7\n")
      File.chmod(0o700, executable)
      _output, error, status = Open3.capture3(
        {"PATH" => "#{directory}:#{ENV.fetch('PATH')}"}, RbConfig.ruby, File.join(__dir__, "build-container.rb"), "--task", "watch"
      )
      assert_equal 7, status.exitstatus
      assert_match(/Mapshot Docker command failed \(7\)/, error)
    end
  end

  #: () -> void
  def test_build_image_enables_pnpm_without_resolving_the_uncopied_yarn_installation
    # The official Node image keeps Yarn under /opt. Copying only /usr/local
    # intentionally leaves its Yarn symlink unresolved in the Ruby build image.
    dockerfile = File.read(File.expand_path("../../Dockerfile", __dir__))
    managers = dockerfile.match(/corepack enable([^\n]*)/).captures.first.split
    Dir.mktmpdir("mapshot-corepack-regression-") do |directory|
      yarn = File.join(directory, "yarn")
      File.symlink(File.join(directory, "uncopied-opt-yarn", "bin/yarn"), yarn)
      _output, error, status = Open3.capture3("corepack", "enable", *managers, "--install-directory", directory)
      assert status.success?, error
      assert File.executable?(File.join(directory, "pnpm"))
      assert_equal File.join(directory, "uncopied-opt-yarn", "bin/yarn"), File.readlink(yarn)
    end
  end

  #: () -> void
  def test_git_prepare_scripts_cannot_start_an_implicit_workspace_install_but_frozen_installs_still_run
    dockerfile = File.read(File.expand_path("../../Dockerfile", __dir__))
    dependencies = dockerfile.split(/^FROM ruby-build-runtime AS dependencies\n/, 2).last.split(/^FROM /, 2).first
    verify_before_run = dependencies[/^ENV pnpm_config_verify_deps_before_run=(\S+)/, 1]
    manager = JSON.parse(File.read(File.expand_path("../../../../package.json", __dir__))).fetch("packageManager")

    Dir.mktmpdir("mapshot-pnpm-install-regression-") do |directory|
      FileUtils.mkdir_p(File.join(directory, "dependency"))
      File.write(File.join(directory, "dependency/package.json"), JSON.generate({"name" => "fixture-dependency", "version" => "1.0.0"}))
      manifest = {"name" => "mapshot-install-regression", "private" => true, "packageManager" => manager,
        "dependencies" => {"fixture-dependency" => "file:./dependency"},
        "scripts" => {"preinstall" => "ruby record-install.rb", "build" => "ruby build.rb"}}
      File.write(File.join(directory, "package.json"), JSON.generate(manifest))
      File.write(File.join(directory, "pnpm-workspace.yaml"), "packages: ['.']\nverifyDepsBeforeRun: install\n")
      File.write(File.join(directory, "record-install.rb"), 'File.write("install-attempted", "installed")')
      File.write(File.join(directory, "build.rb"), 'File.write("build-completed", "built")')
      environment = {"COREPACK_ENABLE_NETWORK" => "0", "pnpm_config_verify_deps_before_run" => verify_before_run,
        "pnpm_config_store_dir" => File.join(directory, "store"), "pnpm_config_cache_dir" => File.join(directory, "cache"),
        "pnpm_config_state_dir" => File.join(directory, "state")}

      # Only fixture initialization skips lifecycle hooks. Every asserted install
      # below uses the ordinary frozen command with hooks enabled and no network.
      output, error, status = Open3.capture3(environment, "pnpm", "install", "--offline", "--ignore-scripts", chdir: directory)
      assert status.success?, "#{output}\n#{error}"
      FileUtils.rm_rf(File.join(directory, "node_modules"))

      output, error, status = Open3.capture3(environment, "pnpm", "run", "build", chdir: directory)
      assert status.success?, "#{output}\n#{error}"
      assert_path_exists File.join(directory, "build-completed")
      refute_path_exists File.join(directory, "install-attempted")

      # Positive control: the provider's default installs before the same script
      # when dependencies are absent and the Docker override is not inherited.
      output, error, status = Open3.capture3(environment.merge("pnpm_config_verify_deps_before_run" => nil),
        "pnpm", "run", "build", chdir: directory)
      assert status.success?, "#{output}\n#{error}"
      assert_path_exists File.join(directory, "install-attempted")
      File.unlink(File.join(directory, "install-attempted"))
      FileUtils.rm_rf(File.join(directory, "node_modules"))

      output, error, status = Open3.capture3(environment, "pnpm", "install", "--frozen-lockfile", "--offline", chdir: directory)
      assert status.success?, "#{output}\n#{error}"
      assert_path_exists File.join(directory, "install-attempted")
      assert_path_exists File.join(directory, "node_modules/fixture-dependency/package.json")

      manifest["dependencies"] = {"changed-dependency" => "file:./dependency"}
      File.write(File.join(directory, "package.json"), JSON.generate(manifest))
      output, error, status = Open3.capture3(environment, "pnpm", "install", "--frozen-lockfile", "--offline", chdir: directory)
      refute status.success?
      assert_match(/ERR_PNPM_OUTDATED_LOCKFILE/, "#{output}\n#{error}")
    end
  end
end
