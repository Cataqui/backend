#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "open3"

base = ENV.fetch("BEFORE_SHA")
base = "HEAD^" if base.empty? || /\A0+\z/.match?(base)
paths, status = Open3.capture2("git", "diff", "--name-only", "-z", base, "HEAD")
exit status.exitstatus unless status.success?
paths = paths.split("\0").reject { |path| path.end_with?(".md") || path.start_with?(".agents/skills/") }
full_validation = paths.any? { |path| !path.start_with?("apps/", "packages/", "infrastructure/") }
infrastructure = full_validation || paths.any? { |path| path.start_with?("infrastructure/") }
workspaces_json, status = Open3.capture2("pnpm", "-r", "list", "--depth", "-1", "--json")
exit status.exitstatus unless status.success?
workspaces = JSON.parse(workspaces_json).reject { |workspace| workspace.fetch("path") == Dir.pwd }
selected = workspaces
unless full_validation
  changed_json, status = Open3.capture2(
    "pnpm", "--filter", "...[#{base}]", "--changed-files-ignore-pattern", "**/*.md",
    "--changed-files-ignore-pattern", ".agents/skills/**", "list", "--depth", "-1", "--json"
  )
  exit status.exitstatus unless status.success?
  changed = JSON.parse(changed_json)
  # pnpm tracks package edges; sibling workspaces also belong to the same deployable application.
  application_directories = changed.filter_map do |workspace|
    relative_path = workspace.fetch("path").delete_prefix("#{Dir.pwd}/")
    relative_path.match(/\Aapps\/(?:workers\/[^\/]+|[^\/]+)/)&.to_s
  end.uniq
  # Native binding imports are configuration-only edges, so pnpm cannot discover their consumers.
  loop do
    consumers = Dir.glob("apps/**/cloudflare.config.ts").filter_map do |config|
      imports = File.read(config).scan(/from\s+["']([^"']+cloudflare\.config\.ts)["']/).flatten
      imported_paths = imports.map { |path| File.expand_path(path, File.dirname(config)).delete_prefix("#{Dir.pwd}/") }
      next unless imported_paths.any? do |path|
        application_directories.any? { |directory| path.start_with?("#{directory}/") }
      end

      config.match(/\Aapps\/(?:workers\/[^\/]+|[^\/]+)/)&.to_s
    end
    expanded_directories = (application_directories + consumers).uniq
    break if expanded_directories.length == application_directories.length

    application_directories = expanded_directories
  end
  selected = workspaces.select do |workspace|
    relative_path = workspace.fetch("path").delete_prefix("#{Dir.pwd}/")
    changed.any? { |candidate| candidate.fetch("name") == workspace.fetch("name") } ||
      application_directories.any? { |directory| relative_path == directory || relative_path.start_with?("#{directory}/") }
  end
end
names = selected.map { |workspace| workspace.fetch("name") }
mapshot = selected.any? { |workspace| workspace.fetch("path").start_with?("#{Dir.pwd}/apps/mapshot") }
File.open(ENV.fetch("GITHUB_OUTPUT"), "a") do |output|
  output.puts "workspaces=#{JSON.generate(names)}"
  output.puts "infrastructure=#{infrastructure}"
  output.puts "repository=#{full_validation || infrastructure}"
  output.puts "mapshot=#{mapshot}"
end
puts "Validation workspaces: #{names.join(', ')}"
