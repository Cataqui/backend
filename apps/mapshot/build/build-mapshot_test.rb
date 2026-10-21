# frozen_string_literal: true

require_relative "../test/test_helper"
require "fileutils"
require "json"
require "open3"
require "tmpdir"
require_relative "build-mapshot"

class MapshotExecutableBuildTest < Minitest::Test
  class Commands
    attr_reader :calls

    #: (?failure: String?) -> void
    def initialize(failure: nil)
      @calls = []
      @failure = failure
    end

    #: (**Object) -> void
    def run(**params)
      @calls << params
      raise @failure if @failure

      return unless params.fetch(:command) == "node" && params.fetch(:args).include?("--destination")

      destination = params.fetch(:args).last
      FileUtils.mkdir_p(File.join(destination, "landmarks"))
      File.binwrite(File.join(destination, "landmarks/qualified.png"), "qualified badge bytes")
    end
  end

  class Fonts
    attr_reader :destinations

    #: () -> void
    def initialize
      @destinations = []
    end

    #: (destination: String) -> void
    def package(destination:)
      @destinations << destination
      FileUtils.mkdir_p(destination)
      File.write(File.join(destination, "verified-font"), "qualified font bytes")
    end
  end

  #: () -> void
  def setup
    @root = Dir.mktmpdir("mapshot-executables-")
    @commands = Commands.new
    @fonts = Fonts.new
    @builder = MapshotExecutableBuild.new(application_root: @root, commands: @commands, fonts: @fonts)
  end

  #: () -> void
  def teardown
    FileUtils.remove_entry(@root)
  end

  #: () -> void
  def test_missing_target_preserves_existing_output_and_runs_no_tools
    FileUtils.mkdir_p(File.join(@root, "dist/tools"))
    File.write(File.join(@root, "dist/tools/current.mjs"), "existing output")
    assert_raises(ArgumentError) { @builder.build }
    assert_empty @commands.calls
    assert_equal "existing output", File.read(File.join(@root, "dist/tools/current.mjs"))
  end

  #: () -> void
  def test_tool_build_replaces_stale_executables_without_reading_or_preparing_font_assets
    FileUtils.mkdir_p(File.join(@root, "dist/tools"))
    File.write(File.join(@root, "dist/tools/obsolete.mjs"), "obsolete output")
    @builder.build(tools: true)
    refute_path_exists File.join(@root, "dist/tools/obsolete.mjs")
    assert_empty @fonts.destinations
    assert_equal 1, @commands.calls.length
    call = @commands.calls.first
    assert_equal "node", call.fetch(:command)
    assert_equal @root, call.fetch(:cwd)
    assert_equal [File.join(@root, "node_modules/@rspack/cli/bin/rspack.js"), "build", "--config",
      File.join(@root, "rspack.config.ts"), "--configName", "tools"], call.fetch(:args)
  end

  #: () -> void
  def test_renderer_assembles_verified_fonts_and_runs_only_the_canvas_adapter_for_badges
    @builder.build(renderer: true)
    fonts = File.join(@root, "dist/native/assets/fonts")
    assert_equal [fonts], @fonts.destinations
    assert_equal "qualified font bytes", File.read(File.join(fonts, "verified-font"))
    assert_equal "renderer", @commands.calls.first.fetch(:args).last
    assert_equal({command: "node", args: [File.join(@root, "build/rendering/rasterize-landmark-badges.ts"),
      "--destination", File.join(@root, "dist/native/assets")], cwd: @root}, @commands.calls.last)
  end

  #: () -> void
  def test_native_integration_target_copies_pixel_fixtures_and_verified_assets
    fixtures = File.join(@root, "test/native/fixtures/owned-renderer")
    FileUtils.mkdir_p(fixtures)
    File.write(File.join(fixtures, "qualified.webp"), "qualified image bytes")
    @builder.build(renderer: true, tools: true, native_test: true)
    bundle = @commands.calls.find { |call| call.fetch(:args).last == "native-test" }
    assert_equal "native-test", bundle.fetch(:args).last
    assert_equal "qualified image bytes", File.read(File.join(@root, "dist/native-test/fixtures/owned-renderer/qualified.webp"))
    assert_equal [File.join(@root, "dist/native/assets/fonts")], @fonts.destinations
    assert_equal 4, @commands.calls.length
    assets = File.join(@root, "dist/native/assets")
    files = Dir.glob("**/*", base: assets).select { |path| File.file?(File.join(assets, path)) }
    assert_includes files, "landmarks/qualified.png"
    assert_includes files, "fonts/verified-font"
    files.each do |path|
      assert_equal File.binread(File.join(assets, path)), File.binread(File.join(@root, "dist/native-test/assets", path))
    end
  end

  #: () -> void
  def test_standalone_native_test_target_prepares_complete_assets_without_a_renderer_build
    FileUtils.mkdir_p(File.join(@root, "test/native/fixtures/owned-renderer"))
    @builder.build(native_test: true)
    assert_equal [File.join(@root, "dist/native-test/assets/fonts")], @fonts.destinations
    assert_equal 2, @commands.calls.length
    assert_equal "qualified badge bytes", File.binread(File.join(@root, "dist/native-test/assets/landmarks/qualified.png"))
    refute_path_exists File.join(@root, "dist/native")
  end

  #: () -> void
  def test_compilation_failure_never_packages_assets
    builder = MapshotExecutableBuild.new(application_root: @root, commands: Commands.new(failure: "compile failed"), fonts: @fonts)
    assert_raises(RuntimeError) { builder.build(renderer: true) }
    assert_empty @fonts.destinations
    refute_path_exists File.join(@root, "dist/native/assets")
  end

  #: () -> void
  def test_rspack_cli_preserves_named_esm_targets_exports_and_runtime_entrypoint_checks
    paths = {"build/build-data.ts" => "build-data", "build/data/mapshot-domain.tool.ts" => "domain-data",
      "build/data/references/worldwide/worldwide-extract.worker.ts" => "worldwide-extract.worker"}
    paths.each do |path, name|
      absolute = File.join(@root, path)
      FileUtils.mkdir_p(File.dirname(absolute))
      File.write(absolute, "export const name: string = #{name.inspect}; export const asset = new URL(\"./assets/\", import.meta.url).pathname; if (import.meta.main) console.log(name);\n")
    end
    application = File.expand_path("..", __dir__)
    File.symlink(File.join(application, "node_modules"), File.join(@root, "node_modules"))
    FileUtils.cp(File.join(application, "rspack.config.ts"), File.join(@root, "rspack.config.ts"))
    MapshotExecutableBuild.new(application_root: @root, fonts: @fonts).build(tools: true)
    assert_equal paths.values.map { |name| "#{name}.mjs" }.sort, Dir.children(File.join(@root, "dist/tools")).sort
    paths.each_value do |name|
      output, status = Open3.capture2("node", File.join(@root, "dist/tools/#{name}.mjs"))
      assert status.success?
      assert_equal "#{name}\n", output
      script = "import { name, asset } from #{File.join(@root, "dist/tools/#{name}.mjs").inspect}; console.log(JSON.stringify({ name, asset }));"
      output, status = Open3.capture2("node", "--input-type=module", "--eval", script)
      assert status.success?
      assert_equal({"name" => name, "asset" => File.join(File.realpath(@root), "dist/tools/assets/")}, JSON.parse(output))
    end
    assert_empty @fonts.destinations
  end

  #: () -> void
  def test_source_cli_rejects_invalid_flags_and_missing_targets_from_any_working_directory
    [@root, File.expand_path("..", __dir__)].each do |directory|
      [[], ["--unknown"], ["unexpected"]].each do |args|
        _output, error, status = Open3.capture3(RbConfig.ruby, File.join(__dir__, "build-mapshot.rb"), *args, chdir: directory)
        assert_equal 1, status.exitstatus
        assert_match(/Select a Mapshot build target|invalid option|Unexpected arguments/, error)
        refute_match(/cannot load such file/, error)
      end
    end
  end

  #: () -> void
  def test_cli_returns_argument_failures_to_the_caller
    [[], ["--unknown"], ["unexpected"]].each do |args|
      _stdout, error = capture_io do
        assert_equal 1, MapshotExecutableBuild.run_cli(args: args)
      end
      assert_match(/Select a Mapshot build target|invalid option|Unexpected arguments/, error)
    end
  end
end
