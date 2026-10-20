# frozen_string_literal: true

require "json"
require "tmpdir"
require_relative "../build/container/build-command"

module MapshotBundleFixture
  def self.build(output:, entry: nil, input: nil, external_packages: false)
    application = File.expand_path("..", __dir__)
    Dir.mktmpdir("mapshot-fixture-config-") do |directory|
      unless entry
        entry = File.join(directory, "fixture.ts")
        File.write(entry, input)
      end
      config = File.join(directory, "rspack.config.ts")
      File.write(config, <<~TYPESCRIPT)
        import { createMapshotBundleConfig } from #{JSON.generate(File.join(application, 'rspack.config.ts'))};
        export default createMapshotBundleConfig({
          name: "fixture",
          entries: { #{JSON.generate(File.basename(output, '.mjs'))}: #{JSON.generate(entry)} },
          directory: #{JSON.generate(File.dirname(output))},
          externalPackages: #{external_packages},
        });
      TYPESCRIPT
      MapshotBuildCommand.new.run(command: "node", args: [File.join(application, "node_modules/@rspack/cli/bin/rspack.js"),
        "build", "--config", config], cwd: application)
    end
  end
end
