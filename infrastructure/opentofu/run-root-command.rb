command = ARGV.fetch(0, nil)
abort "OpenTofu root command must be init, test, or validate." unless %w[init test validate].include?(command)

roots_directory = File.expand_path("roots", __dir__)
root_names = Dir.children(roots_directory).select do |name|
  File.directory?(File.join(roots_directory, name)) && File.file?(File.join(roots_directory, name, "versions.tf"))
end.sort
abort "No OpenTofu roots were found." if root_names.empty?

root_names.each do |name|
  arguments = ["-chdir=#{File.join(roots_directory, name)}", command]
  arguments << "-backend=false" if command == "init"
  puts "OpenTofu #{command}: #{name}"
  $stdout.flush
  success = system("tofu", *arguments)
  abort "Could not start OpenTofu." if success.nil?
  exit($?.exitstatus || 1) unless success
end
