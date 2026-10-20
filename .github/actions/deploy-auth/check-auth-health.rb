#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"

environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "Unsupported deployment environment." unless %w[staging production].include?(environment)
base_url = environment == "staging" ? "https://staging.auth.cataqui.com" : "https://auth.cataqui.com"
successes = 0

# curl performs the HTTP request; the repository-specific gate requires three
# consecutive healthy public responses before accepting an Auth deployment.
1.upto(40) do |attempt|
  status, = Open3.capture3(
    "curl", "--silent", "--connect-timeout", "5", "--max-time", "10",
    "--output", File::NULL, "--write-out", "%{http_code}", "#{base_url}/v1/health"
  )
  successes = status == "200" ? successes + 1 : 0
  if successes >= 3
    File.open(ENV.fetch("GITHUB_STEP_SUMMARY"), "a") do |summary|
      summary.puts "Auth public Worker passed its health checks."
    end
    exit 0
  end
  sleep 15 if attempt < 40
end
abort "Auth health verification failed."
