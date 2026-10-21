require "rake"
require "rbconfig"
require "tempfile"
require "yaml"

desc "Lint Ruby automation and syntax-check inline Ruby action steps"
task :lint do
  ruby Gem.bin_path("rubocop", "rubocop"), "--lint"
  Dir.glob(".github/{actions,workflows}/**/*.{yml,yaml}").each do |path|
    document = YAML.safe_load_file(path, aliases: true)
    steps = document.dig("runs", "steps") || document.fetch("jobs", {}).values.flat_map { |job| job.fetch("steps", []) }
    steps.each do |step|
      next unless step["shell"]&.match?(/\A(?:bundle exec )?ruby \{0\}\z/) && step["run"]

      Tempfile.create(["cataqui-inline-ruby-", ".rb"]) do |file|
        file.write(step.fetch("run"))
        file.flush
        abort "Invalid Ruby in #{path}: #{step.fetch('name', 'unnamed step')}" unless system(RbConfig.ruby, "-c",
                                                                                             file.path, out: File::NULL)
      end
    end
  end
end

component_tests = {
  bootstrap: "infrastructure/bootstrap",
  mapshot: "apps/mapshot"
}.map do |name, directory|
  namespace :test do
    desc "Run #{name} tests"
    task name do
      ruby Gem.bin_path("rake", "rake"), "test", chdir: File.join(__dir__, directory)
    end
  end
  "test:#{name}"
end

desc "Run each component's Ruby automation tests"
task test: component_tests

desc "Run Ruby automation tests with line and branch coverage"
task :coverage do
  ENV["COVERAGE"] = "1"
  Rake::Task[:test].invoke
end
