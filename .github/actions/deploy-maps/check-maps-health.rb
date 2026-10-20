#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"

environment = ENV.fetch("INPUT_ENVIRONMENT")
base_url = environment == "staging" ? "https://staging.maps.cataqui.com" : "https://maps.cataqui.com"
successes = 0

# curl performs the HTTP request; the repository-specific gate requires three
# consecutive healthy public responses before accepting a Maps deployment.
1.upto(40) do |attempt|
  status, = Open3.capture3(
    "curl", "--silent", "--connect-timeout", "5", "--max-time", "10",
    "--output", File::NULL, "--write-out", "%{http_code}", "#{base_url}/v1/health"
  )
  successes = status == "204" ? successes + 1 : 0
  if successes >= 3
    File.open(ENV.fetch("GITHUB_STEP_SUMMARY"), "a") do |summary|
      summary.puts "Maps public Worker passed its health checks."
    end
    exit 0
  end
  sleep 15 if attempt < 40
end
abort "Maps health verification failed."
