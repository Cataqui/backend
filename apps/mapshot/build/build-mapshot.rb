#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "optparse"
require_relative "container/build-command"
require_relative "fonts/font-assets"

# Rspack's supported CLI owns TypeScript compilation; Ruby selects named build
# configurations and assembles their verified assets.
class MapshotExecutableBuild
  #: (args: Array[String]) -> Integer
  def self.run_cli(args:)
    options = {renderer: false, tools: false, native_test: false}
    OptionParser.new do |parser|
      parser.banner = "Usage: ruby build/build-mapshot.rb [--renderer] [--tools] [--native-test]"
      parser.on("--renderer") { options[:renderer] = true }
      parser.on("--tools") { options[:tools] = true }
      parser.on("--native-test") { options[:native_test] = true }
    end.parse!(args)
    raise ArgumentError, "Unexpected arguments: #{args.join(' ')}" unless args.empty?

    new.build(**options)
    0
  rescue StandardError => error
    warn error.message
    1
  end

  #: (?application_root: String, ?commands: MapshotBuildCommand, ?fonts: MapshotFontAssets) -> void
  def initialize(application_root: File.expand_path("..", __dir__), commands: MapshotBuildCommand.new,
    fonts: MapshotFontAssets.new(application_root: application_root))
    @_application_root = application_root
    @_commands = commands
    @_fonts = fonts
  end

  #: (?renderer: bool, ?tools: bool, ?native_test: bool) -> void
  def build(renderer: false, tools: false, native_test: false)
    raise ArgumentError, "Select a Mapshot build target." unless renderer || tools || native_test

    if renderer
      _bundle(directory: "dist/native", target: "renderer")
      _package_assets(directory: "dist/native")
    end
    if tools
      _bundle(directory: "dist/tools", target: "tools")
    end
    return unless native_test

    _bundle(directory: "dist/native-test", target: "native-test")
    fixtures = File.join(@_application_root, "dist/native-test/fixtures")
    FileUtils.mkdir_p(fixtures)
    FileUtils.cp_r(File.join(@_application_root, "test/native/fixtures/owned-renderer"), fixtures)
    if renderer
      FileUtils.cp_r(File.join(@_application_root, "dist/native/assets"), File.join(@_application_root, "dist/native-test"))
    else
      _package_assets(directory: "dist/native-test")
    end
  end

  private

  #: (directory: String, target: String) -> void
  def _bundle(directory:, target:)
    destination = File.join(@_application_root, directory)
    FileUtils.rm_rf(destination)
    FileUtils.mkdir_p(destination)
    @_commands.run(command: "node", args: [File.join(@_application_root, "node_modules/@rspack/cli/bin/rspack.js"),
      "build", "--config", File.join(@_application_root, "rspack.config.ts"), "--configName", target], cwd: @_application_root)
  end

  #: (directory: String) -> void
  def _package_assets(directory:)
    assets = File.join(@_application_root, directory, "assets")
    FileUtils.mkdir_p(assets)
    @_fonts.package(destination: File.join(assets, "fonts"))
    # Canvas and the qualified Mateo icon definitions are Node-only dependencies.
    # The adapter performs rasterization only; Ruby owns target/asset assembly.
    @_commands.run(command: "node", args: [File.join(@_application_root, "build/rendering/rasterize-landmark-badges.ts"),
      "--destination", assets], cwd: @_application_root)
  end
end

exit(MapshotExecutableBuild.run_cli(args: ARGV)) if $PROGRAM_NAME == __FILE__
