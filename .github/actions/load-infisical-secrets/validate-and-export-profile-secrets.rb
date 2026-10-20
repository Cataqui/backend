#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"

# The provider action fetches secrets; this repository owns required names and aliases.
profile_name = ENV.fetch("INPUT_PROFILE")
profile = JSON.parse(File.read(ENV.fetch("PROFILE_MANIFEST"), encoding: "UTF-8")).fetch(profile_name)
profile.fetch("required_secrets").each do |name|
  value = ENV.fetch(name, "")
  abort "#{name} is required in the selected Infisical profile." if value.empty?
  abort "#{name} must be a single-line value." if value.include?("\n") || value.include?("\r")

  puts "::add-mask::#{value.gsub("%", "%25")}"
end
File.open(ENV.fetch("GITHUB_ENV"), "a") do |output|
  profile.fetch("environment_aliases").each do |name, source|
    output.puts "#{name}=#{ENV.fetch(source)}"
  end
  unless %w[neon-projects neon-api-keys].include?(profile_name)
    output.puts "NEON_ACCOUNT_API_KEY="
    output.puts "NEON_ACCOUNT_API_KEY_ID="
  end
end
