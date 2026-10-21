#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"

environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "Unsupported deployment environment." unless %w[staging production].include?(environment)
base_url = environment == "staging" ? "https://staging.api.cataqui.com" : "https://api.cataqui.com"

# curl performs the HTTP probes; this repository-specific gate checks the API's
# readiness and protected feed routes together before accepting a rollout.
{
  "/v1/health/live" => "204",
  "/v1/health" => "200",
  "/v1/feed" => "401"
}.each do |path, expected_status|
  status, = Open3.capture3(
    "curl", "--silent", "--connect-timeout", "5", "--max-time", "10",
    "--output", File::NULL, "--write-out", "%{http_code}", "#{base_url}#{path}"
  )
  exit 1 unless status == expected_status
end
