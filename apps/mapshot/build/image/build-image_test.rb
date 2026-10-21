# frozen_string_literal: true

require_relative "../../test/test_helper"
require "digest"
require "fileutils"
require "json"
require "open3"
require "rbconfig"
require "stringio"
require "tmpdir"
require_relative "build-image"

class MapshotImageBuildTest < Minitest::Test
  class SourceData
    attr_reader :calls
    attr_accessor :failure

    #: () -> void
    def initialize
      @calls = []
    end

    #: (kind: String, value: Hash[String, Object]) -> Hash[String, Object]
    def validate(kind:, value:)
      @calls << {kind: kind, value: value}
      raise "Source candidate is invalid." if failure

      value
    end
  end

  class Indexes
    attr_reader :calls
    attr_accessor :failure_stage

    #: (application_root: String) -> void
    def initialize(application_root:)
      @_application_root = application_root
      @calls = []
    end

    #: (bucket: String, manifest_key: String, sha256: String, root: String) -> void
    def install_for_container(bucket:, manifest_key:, sha256:, root:)
      @calls << {bucket: bucket, manifest_key: manifest_key, sha256: sha256, root: root}
      FileUtils.mkdir_p(root)
      File.write(File.join(root, "manifest.json"), "verified index fixture")
      raise "Build step failed." if ["fetch", "container"].include?(failure_stage)

      File.write(File.join(@_application_root, ".source-indexes.Dockerfile"), "FROM renderer\n# verified indexes\n")
      nil
    end
  end

  class Commands
    attr_reader :calls, :bundle_directory, :bundled_source, :dockerfile
    attr_accessor :digests, :failure_stage, :oversized, :real_cf

    #: (root: String, image: String) -> void
    def initialize(root:, image:)
      @root = root
      @digests = [image]
      @calls = []
    end

    #: (command: String, args: Array[String], cwd: String, **Object) -> String?
    def run(command:, args:, cwd:, **options)
      @calls << {command: command, args: args, cwd: cwd, **options}
      stage = if command == "docker" then args.first == "build" ? "build" : "inspect"
      elsif command == "pnpm" then args.include?("@cataqui/mapshot-worker^...") ? "contracts" : args.include?("push") ? "push" : "bundle"
      elsif command == "tar" then "archive"
      end
      raise "Build step failed." if failure_stage == stage

      if stage == "build"
        @bundled_source = JSON.parse(File.read(File.join(@root, "generated/source-indexes/image/source.json")))
        @dockerfile = File.read(File.join(@root, ".source-indexes.Dockerfile"))
      end
      case stage
      when "contracts"
        if real_cf
          MapshotBuildCommand.new.run(command: command, args: args, cwd: File.expand_path("../..", __dir__))
        end
        ""
      when "inspect"
        JSON.generate(digests)
      when "bundle"
        @bundle_directory = File.join(@root, "worker/.cloudflare/output")
        if real_cf
          MapshotBuildCommand.new.run(command: "node", args: [
            File.expand_path("../../worker/node_modules/cf/bin/cf", __dir__), *args.drop(4)
          ], cwd: File.join(@root, "worker"), env: options.fetch(:env))
        else
          FileUtils.mkdir_p(File.join(@bundle_directory, "v0/workers/default/bundle"))
          File.write(File.join(@bundle_directory, "v0/config.json"), "retained native configuration")
          File.write(File.join(@bundle_directory, "v0/workers/default/bundle/worker.js"), "retained worker bundle")
        end
        ""
      when "archive"
        if oversized
          File.open(args.fetch(1), "wb") { |file| file.truncate((64 * 1024 * 1024) + 1) }
          ""
        else
          MapshotBuildCommand.new.run(command: command, args: args, cwd: cwd)
        end
      else
        ""
      end
    end
  end

  #: () -> void
  def setup
    @directory = Dir.mktmpdir("mapshot-image-test-")
    @root = File.join(@directory, "apps/mapshot")
    FileUtils.mkdir_p(File.join(@root, "worker"))
    @image = "registry.cloudflare.com/#{'a' * 32}/cataqui-mapshot-staging@sha256:#{'b' * 64}"
    @source = {"release" => {}, "prepared" => {"manifestKey" => "source/indexes/manifest.json", "sha256" => "c" * 64}}
    @input = {environment: "staging", account_id: "a" * 32, source: @source, operation: "f" * 64, worker_path: File.join(@directory, "worker.tar.gz")}
    @commands = Commands.new(root: @root, image: @image)
    @data = SourceData.new
    @indexes = Indexes.new(application_root: @root)
    @builder = MapshotImageBuild.new(application_root: @root, commands: @commands, data: @data, indexes: @indexes)
    File.write(File.join(@root, "Dockerfile"), "FROM renderer\n")
  end

  #: () -> void
  def teardown
    FileUtils.remove_entry(@directory)
  end

  #: () -> void
  def test_fetches_verified_source_indexes_before_building_one_image_with_supported_tools
    result = @builder.build_and_publish(**@input)
    assert_equal @image, result.fetch("image")
    assert_equal [{kind: "source", value: @source}], @data.calls
    assert_equal [{bucket: "cataqui-mapshot-staging", manifest_key: @source.fetch("prepared").fetch("manifestKey"),
      sha256: "c" * 64, root: File.join(@root, "generated/source-indexes/image")}], @indexes.calls
    builds = @commands.calls.select { |call| call.fetch(:command) == "docker" && call.fetch(:args).first == "build" }
    assert_equal 1, builds.length
    assert_equal ["build", "--platform", "linux/amd64", "--provenance=false", "-f",
      File.join(@root, ".source-indexes.Dockerfile"), "-t", "cataqui-mapshot-staging:#{'f' * 64}", "."], builds.first.fetch(:args)
    assert_equal @directory, builds.first.fetch(:cwd)
    push = @commands.calls.find { |call| call.fetch(:args).include?("push") }
    assert_equal ["--dir", "worker", "exec", "cf", "containers", "push", "--tag", "cataqui-mapshot-staging:#{'f' * 64}"], push.fetch(:args)
    inspect = @commands.calls.find { |call| call.fetch(:args).include?("inspect") }
    assert_equal ["image", "inspect", "registry.cloudflare.com/#{'a' * 32}/cataqui-mapshot-staging:#{'f' * 64}", "--format", "{{json .RepoDigests}}"], inspect.fetch(:args)
  end

  #: () -> void
  def test_retains_source_and_native_build_output_without_rewriting_configuration
    result = @builder.build_and_publish(**@input)
    assert_equal Digest::SHA256.file(@input.fetch(:worker_path)).hexdigest, result.dig("worker", "sha256")
    assert_equal @input.fetch(:worker_path), result.dig("worker", "path")
    assert_equal 0o600, File.stat(@input.fetch(:worker_path)).mode & 0o777
    retained = File.join(@directory, "retained")
    FileUtils.mkdir(retained)
    MapshotBuildCommand.new.run(command: "tar", args: ["-xzf", @input.fetch(:worker_path)], cwd: retained)
    assert_equal "retained native configuration", File.read(File.join(retained, ".cloudflare/output/v0/config.json"))
    assert_equal "retained worker bundle", File.read(File.join(retained, ".cloudflare/output/v0/workers/default/bundle/worker.js"))
    refute_path_exists File.join(retained, "wrangler.jsonc")
    build = @commands.calls.find { |call| call.fetch(:args).include?("--mode") }
    assert_equal ["--dir", "worker", "exec", "cf", "build", "--mode", "staging"], build.fetch(:args)
    assert_equal({"MAPSHOT_CONTAINER_IMAGE" => @image}, build.fetch(:env))
    assert_nil ENV["MAPSHOT_CONTAINER_IMAGE"]
    assert_equal [build], (@commands.calls.select { |call| call.key?(:env) })
    assert_equal @source, @commands.bundled_source
    assert_includes @commands.dockerfile, 'COPY --chown=root:root ["apps/mapshot/generated/source-indexes/image/source.json", "/app/data/indexes/source.json"]'
    assert(@commands.calls.none? { |call| call.fetch(:args).include?("deploy") })
    _assert_cleaned
  end

  #: () -> void
  def test_refuses_unmatched_immutable_digests_or_mutable_and_malformed_references_before_bundling
    [[], [@image.sub("staging", "production")], [@image.sub("a" * 32, "c" * 32)], ["renderer:latest"], [1], {}].each do |digests|
      @commands.digests = digests
      assert_raises(RuntimeError) { @builder.build_and_publish(**@input) }
      refute(@commands.calls.any? { |call| call.fetch(:args).include?("--mode") })
      _assert_cleaned
    end
  end

  #: () -> void
  def test_source_validation_precedes_commands_and_removal_of_existing_inputs
    @data.failure = true
    destination = File.join(@root, "generated/source-indexes/image")
    FileUtils.mkdir_p(destination)
    marker = File.join(destination, "interrupted.body")
    File.write(marker, "existing input")
    assert_raises(RuntimeError) { @builder.build_and_publish(**@input) }
    assert_empty @commands.calls
    assert_path_exists marker
  end

  #: () -> void
  def test_rejects_invalid_environment_account_operation_or_relative_worker_destination
    [{environment: "preview"}, {account_id: "invalid"}, {operation: "mutable-tag"}, {worker_path: "worker.tar.gz"}].each do |changes|
      assert_raises(ArgumentError) { @builder.build_and_publish(**@input.merge(changes)) }
      assert_empty @commands.calls
    end
  end

  #: () -> void
  def test_retains_worker_archives_larger_than_the_previous_application_quota
    @commands.oversized = true
    assert_equal @image, @builder.build_and_publish(**@input).fetch("image")
    assert_equal((64 * 1024 * 1024) + 1, File.size(@input.fetch(:worker_path)))
    refute_path_exists @commands.bundle_directory
    _assert_cleaned
  end

  #: () -> void
  def test_cleans_image_owned_inputs_after_each_failed_stage
    ["fetch", "container", "build", "push", "inspect", "contracts", "bundle", "archive"].each do |stage|
      @commands.failure_stage = stage
      @indexes.failure_stage = stage
      assert_raises(RuntimeError, stage) { @builder.build_and_publish(**@input) }
      _assert_cleaned
      refute_path_exists @commands.bundle_directory if @commands.bundle_directory
      refute_path_exists @input.fetch(:worker_path)
    end
  end

  #: () -> void
  def test_replaces_stale_inputs_and_supports_repeated_builds_without_removing_independent_indexes
    indexes = File.join(@root, "generated/source-indexes")
    FileUtils.mkdir_p(File.join(indexes, "image"))
    File.write(File.join(indexes, "manifest.json"), "independent prepared bundle")
    File.write(File.join(indexes, "image/interrupted.body"), "interrupted download")
    [".source-indexes.Dockerfile"].each do |name|
      File.write(File.join(@root, name), "stale generated input from interrupted build")
    end
    2.times do
      assert_equal @image, @builder.build_and_publish(**@input).fetch("image")
      assert_equal "independent prepared bundle", File.read(File.join(indexes, "manifest.json"))
      _assert_cleaned
    end
  end

  #: () -> void
  def test_actual_cf_build_produces_a_portable_prebuilt_worker_without_source_or_configuration
    worker = File.join(@root, "worker")
    File.symlink(File.expand_path("../../worker/node_modules", __dir__), File.join(worker, "node_modules"))
    File.write(File.join(worker, "package.json"), JSON.generate({"type" => "module", "devDependencies" => {"wrangler" => "4.145.0"}}))
    File.write(File.join(worker, "wrangler.config.ts"), 'import { defineWranglerConfig } from "wrangler/experimental-config"; export default defineWranglerConfig({});')
    File.write(File.join(worker, "cloudflare.config.ts"), <<~TS)
      import { bindings, defineConfig, defineContainer, exports } from "cf/config";
      export default defineConfig(({ mode }) => {
        const container = defineContainer({
          name: `cataqui-mapshot-${mode}`, image: { reference: process.env.MAPSHOT_CONTAINER_IMAGE },
          instanceType: "standard-3", maxInstances: 1,
        });
        return {
          accountId: "#{'a' * 32}",
          worker: {
            name: `cataqui-mapshot-${mode}`, entrypoint: "./worker.ts", compatibilityDate: "2026-10-02",
            exports: { MapshotContainer: exports.durableObject({ storage: "sqlite", container: container }) },
            env: { CONTAINER: bindings.durableObject({ worker: `cataqui-mapshot-${mode}`, exportName: "MapshotContainer" }) },
          },
          containers: [container],
        };
      });
    TS
    File.write(File.join(worker, "worker.ts"), 'import { DurableObject } from "cloudflare:workers"; export class MapshotContainer extends DurableObject {} export default { fetch() { return new Response(null, {status:404}); } };')
    @commands.real_cf = true
    @builder.build_and_publish(**@input)
    retained = File.join(@directory, "retained-worker")
    FileUtils.mkdir(retained)
    MapshotBuildCommand.new.run(command: "tar", args: ["-xzf", @input.fetch(:worker_path)], cwd: retained)
    bundle = File.join(retained, ".cloudflare/output/v0/workers/default/bundle/worker.js")
    assert_includes File.read(bundle), "Response"
    container = Dir.glob(File.join(retained, ".cloudflare/output/v0/containers/*/container.config.json")).fetch(0)
    assert_equal @image, JSON.parse(File.read(container)).dig("image", "reference")
    FileUtils.rm_r(worker)
    command = File.expand_path("../../worker/node_modules/cf/bin/cf", __dir__)
    output = MapshotBuildCommand.new.run(command: "node", args: [command,
      "deploy", "--dry-run", "--prebuilt", "--mode", "staging", "--provision=false", "--containers-rollout=immediate"
    ], cwd: retained, capture_output: true)
    assert_includes output, "--dry-run: exiting now."
    assert_raises(MapshotBuildCommand::Failure) do
      MapshotBuildCommand.new.run(command: "node", args: [command,
        "deploy", "--dry-run", "--prebuilt", "--mode", "production", "--provision=false"
      ], cwd: retained)
    end
  end

  #: () -> void
  def test_cli_failure_does_not_expose_inputs_provider_output_or_stack_trace
    _output, error, status = Open3.capture3(RbConfig.ruby, File.join(__dir__, "build-image.rb"), "--output", File.join(@directory, "output.json"),
      stdin_data: JSON.generate(@input.transform_keys(&:to_s).merge("environment" => "private-input")))
    refute status.success?
    assert_equal "Mapshot image build failed. Provider output was suppressed to protect credentials.\n", error
    refute_path_exists File.join(@directory, "output.json")
  end

  #: () -> void
  def test_cli_writes_private_json_with_existing_public_contract_and_worker_archive
    output = File.join(@directory, "output.json")
    File.write(output, "old output")
    File.chmod(0o644, output)
    input = StringIO.new(JSON.generate({
      "environment" => @input.fetch(:environment), "accountId" => @input.fetch(:account_id), "source" => @source,
      "operation" => @input.fetch(:operation), "workerPath" => @input.fetch(:worker_path)
    }))
    @builder.run(arguments: ["--output", output], input: input)
    assert_equal({"image" => @image, "worker" => {"path" => @input.fetch(:worker_path),
      "sha256" => Digest::SHA256.file(@input.fetch(:worker_path)).hexdigest}}, JSON.parse(File.read(output)))
    assert_equal 0o600, File.stat(output).mode & 0o777
    _assert_cleaned
  end

  #: () -> void
  def test_cli_rejects_missing_output_or_unexpected_arguments_before_running_commands
    [[], ["--output", File.join(@directory, "output.json"), "unexpected"]].each do |arguments|
      assert_raises(ArgumentError) { @builder.run(arguments: arguments, input: StringIO.new("{}")) }
    end
    assert_empty @commands.calls
  end

  private

  #: () -> void
  def _assert_cleaned
    ["generated/source-indexes/image", ".source-indexes.Dockerfile", "worker/.cloudflare/output"].each do |path|
      refute_path_exists File.join(@root, path)
    end
  end
end
