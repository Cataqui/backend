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
        else
          targets.transform_values! { true }
        end
      rescue JSON::ParserError, SystemCallError
        targets.transform_values! { true }
      end
    when /\A\.github\/actions\/deploy-ai\//, /\Aapps\/workers\/ai\//
      targets["ai"] = true
    when /\A\.github\/actions\/deploy-maps\//, /\Aapps\/workers\/maps\//
      targets["maps"] = true
    when "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
         "Gemfile", "Gemfile.lock", "Rakefile", ".ruby-version", ".rubocop.yml",
         /\Apackages\/(?:async|workerhole)\//, /\Apackages\/validation\//,
         /\Apackages\/response\//, /\A\.github\/scripts\/cloudflare\//,
         /\A\.github\/actions\/.*\.(?:ts|rb)\z/,
         /\A\.github\/actions\/(?:setup-node-workspace|setup-ruby-workspace|resolve-deployment|deploy-[^\/]+|neon-migrations|load-infisical-secrets)\//
      targets.transform_values! { true }
    when /\Aapps\/api\//
      targets["api"] = true
    when /\Aapps\/mapshot\//, /\A\.github\/workflows\/mapshot-.*\.yml\z/
      targets["mapshot"] = true
    when /\Aapps\/workers\/auth\//
      targets["auth"] = true
    when /\Apackages\/auth-schemas\//
      targets["api"] = true
      targets["maps"] = true
      targets["auth"] = true
    when /\Apackages\/places\//
      targets["maps"] = true
      targets["mapshot"] = true
    end
  end
else
  abort "Unsupported deployment scope."
end
targets["api"] = true if targets.fetch("maps")
targets["maps"] = true if targets.fetch("auth")
targets["ai"] = true if targets.fetch("auth")
targets["api"] = true if targets.fetch("auth")
targets["maps"] = true if targets.fetch("api")
targets["mapshot"] = true if %w[api maps auth].any? { |name| targets.fetch(name) }
File.open(ENV.fetch("GITHUB_OUTPUT"), "a") do |output|
  output.puts "deploy-mapshot=#{targets.fetch("mapshot")}"
  output.puts "environment=#{environment}"
  %w[ai api maps auth].each { |name| output.puts "deploy-#{name}=#{targets.fetch(name)}" }
end
