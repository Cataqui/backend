#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "open3"

# Git supplies changed paths; repository-owned dependency rules choose deployment targets.
environment = case ENV.fetch("GITHUB_REF")
when "refs/heads/staging" then "staging"
when "refs/heads/main" then "production"
else abort "Deployments require staging or main."
end
targets = { "ai" => false, "api" => false, "maps" => false, "mapshot" => false, "auth" => false }
scope = ENV.fetch("DEPLOYMENT_SCOPE")
infrastructure = scope != "automatic"
case scope
when "all"
  targets.transform_values! { true }
when "infrastructure"
  # Infrastructure provisioning does not imply application deployment.
when *targets.keys
  targets[scope] = true
when "automatic"
  base = ENV.fetch("BEFORE_SHA")
  base = "HEAD^" if base.empty? || /\A0+\z/.match?(base)
  changed_paths, status = Open3.capture2("git", "diff", "--name-only", base, ENV.fetch("GITHUB_SHA"))
  exit status.exitstatus unless status.success?
  changed_paths.each_line(chomp: true) do |path|
    next if path.end_with?(".md") || path.start_with?(".agents/skills/")
    validation_only = path.match?(%r{(?:\A|/)(?:test|tests)/|\.(?:spec|test)\.[cm]?[jt]sx?\z|_test\.rb\z|\.snap\z|(?:\A|/)vitest[^/]*\.ts\z})
    next if validation_only

    case path
    when ".github/actions/load-infisical-secrets/profiles.json"
      before_json, before_status = Open3.capture2("git", "show", "#{base}:#{path}")
      begin
        before = JSON.parse(before_json.force_encoding("UTF-8")) if before_status.success?
        after = JSON.parse(File.read(path, encoding: "UTF-8"))
        if before_status.success? && before.is_a?(Hash) && after.is_a?(Hash)
          targets.each_key do |application|
            %w[runtime deployment].each do |role|
              profile = "#{application}-#{role}"
              targets[application] = true unless before[profile] == after[profile]
            end
          end
          infrastructure = (before.keys | after.keys).any? do |profile|
            !profile.match?(/\A(?:ai|api|maps|mapshot|auth)-(?:runtime|deployment)\z/) && before[profile] != after[profile]
          end || infrastructure
        else
          targets.transform_values! { true }
          infrastructure = true
        end
      rescue JSON::ParserError, SystemCallError
        targets.transform_values! { true }
        infrastructure = true
      end
    when /\A\.github\/actions\/deploy-ai\//, /\Aapps\/workers\/ai\//
      targets["ai"] = true
    when /\A\.github\/actions\/deploy-maps\//, /\Aapps\/workers\/maps\//
      targets["maps"] = true
    when /\A\.github\/actions\/deploy-mapshot\//, /\Aapps\/mapshot\//, /\A\.github\/workflows\/mapshot-.*\.yml\z/
      targets["mapshot"] = true
    when /\A\.github\/actions\/deploy-auth\//, /\Aapps\/workers\/auth\//
      targets["auth"] = true
    when /\A\.github\/actions\/deploy-api\//, /\Aapps\/api\//
      targets["api"] = true
    when "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
         "Gemfile", "Gemfile.lock", ".ruby-version",
         /\A\.github\/scripts\/cloudflare\//,
         /\Apatches\//,
         /\A\.github\/actions\/(?:setup-node-workspace|setup-ruby-workspace|neon-migrations|load-infisical-secrets)\//
      targets.transform_values! { true }
    when /\Ainfrastructure\//, /\A\.github\/actions\/(?!resolve-deployment\/)/
      infrastructure = true
    when /\Apackages\/[^\/]+\//
      package_directory = path.split("/").first(2).join("/")
      dependents_json, dependents_status = Open3.capture2("pnpm", "--filter", "...{./#{package_directory}}", "list", "--depth", "-1", "--json")
      exit dependents_status.exitstatus unless dependents_status.success?
      JSON.parse(dependents_json).each do |workspace|
        relative_path = workspace.fetch("path").delete_prefix("#{Dir.pwd}/")
        application = relative_path.match(/\Aapps\/(?:workers\/)?([^\/]+)/)&.captures&.first
        targets[application] = true if targets.key?(application)
      end
    end
  end
else
  abort "Unsupported deployment scope."
end
File.open(ENV.fetch("GITHUB_OUTPUT"), "a") do |output|
  output.puts "deploy-infrastructure=#{infrastructure}"
  output.puts "deploy-mapshot=#{targets.fetch("mapshot")}"
  output.puts "environment=#{environment}"
  %w[ai api maps auth].each { |name| output.puts "deploy-#{name}=#{targets.fetch(name)}" }
end
puts "Deployment targets (#{environment}): #{targets.select { |_name, selected| selected }.keys.join(', ')}; infrastructure=#{infrastructure}"
