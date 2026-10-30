command = ARGV.fetch(0, nil)
abort "OpenTofu root command must be init, test, or validate." unless %w[init test validate].include?(command)

roots_directory = File.expand_path("roots", __dir__)
root_names = Dir.children(roots_directory).select do |name|
  File.directory?(File.join(roots_directory, name)) && File.file?(File.join(roots_directory, name, "versions.tf"))
end.sort
abort "No OpenTofu roots were found." if root_names.empty?

root_names.each do |name|
  directory = File.join(roots_directory, name)
  # Native plan/apply tests already validate configuration. Roots without tests
  # still need validation: `tofu test` alone accepts an untested, invalid root.
  has_tests = Dir.glob(File.join(directory, "{*,tests/*}.{tftest,tofutest}.{hcl,json}")).any?
  root_command = command == "test" && !has_tests ? "validate" : command
  arguments = ["-chdir=#{directory}", root_command]
  arguments.concat(["-backend=false", "-lockfile=readonly"]) if command == "init"
  puts "OpenTofu #{root_command}: #{name}"
  $stdout.flush
  success = system("tofu", *arguments)
  abort "Could not start OpenTofu." if success.nil?
  exit($?.exitstatus || 1) unless success
end
