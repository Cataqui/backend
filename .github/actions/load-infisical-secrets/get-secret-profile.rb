#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"

# Infisical's action fetches a path; this repository owns the approved profile allowlist.
abort "environment must be staging or production." unless %w[staging
                                                             production].include?(ENV.fetch("INPUT_ENVIRONMENT"))
unless /\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/.match?(ENV.fetch("INFISICAL_IDENTITY_ID"))
  abort "The selected GitHub environment must define INFISICAL_OPENTOFU_IDENTITY_ID as a lowercase UUID."
end
if ENV.fetch("ACTIONS_ID_TOKEN_REQUEST_URL", "").empty? || ENV.fetch("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").empty?
  abort "The caller must grant id-token: write."
end

profiles = JSON.parse(File.read(ENV.fetch("PROFILE_MANIFEST"), encoding: "UTF-8"))
profile = profiles[ENV.fetch("INPUT_PROFILE")]
abort "profile is not declared in profiles.json." unless profile

required_secrets = profile["required_secrets"]
aliases = profile["environment_aliases"]
valid_profile = profile["secret_path"].is_a?(String) &&
                %r{\A/[a-z0-9]+(?:/[a-z0-9-]+)*\z}.match?(profile["secret_path"]) &&
                required_secrets.is_a?(Array) && !required_secrets.empty? &&
                required_secrets.all? { |name| name.is_a?(String) && /\A[A-Z][A-Z0-9_]*\z/.match?(name) } &&
                required_secrets.uniq.length == required_secrets.length && aliases.is_a?(Hash) &&
                aliases.all? do |name, source|
                  /\A[A-Za-z_][A-Za-z0-9_]*\z/.match?(name) && source.is_a?(String) &&
                    /\A[A-Z][A-Z0-9_]*\z/.match?(source) && required_secrets.include?(source)
                end
valid_profile &&= [true, false].include?(profile["authenticate_infisical_provider"])
abort "profile configuration is invalid." unless valid_profile

manifest = JSON.parse(File.read(File.join(ENV.fetch("GITHUB_WORKSPACE"), "infrastructure/manifest.json"),
                                encoding: "UTF-8"))
project_slug = manifest.dig("infisical", "project", "slug")
unless project_slug.is_a?(String) && /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/.match?(project_slug)
  abort "Infisical project slug is invalid."
end
File.open(ENV.fetch("GITHUB_OUTPUT"), "a") do |output|
  output.puts "secret-path=#{profile.fetch('secret_path')}"
  output.puts "authenticate-infisical-provider=#{profile.fetch('authenticate_infisical_provider')}"
  output.puts "project-slug=#{project_slug}"
end
