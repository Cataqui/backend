#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "rbconfig"

environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "Unsupported deployment environment." unless %w[staging production].include?(environment)
File.umask(0o077)
container_app_name = ENV.fetch("CONTAINER_APP_NAME")
build = JSON.parse(File.read(".cloudflare/output/v0/config.json", encoding: "UTF-8"))
container_log = File.join(ENV.fetch("RUNNER_TEMP"), "cataqui-api-containers.log")
failures = 0
successes = 0
maximum_attempts = environment == "staging" ? 40 : 80
startup_attempts = environment == "staging" ? 20 : 40

# Wrangler derives readiness from dashboard instance health. cf's application
# endpoints return configuration, without this dashboard readiness summary.
1.upto(maximum_attempts) do |attempt|
  rollout_state = "progressing"
  inspected = File.open(container_log, "w", 0o600) do |log|
    system(
      { "CLOUDFLARE_ACCOUNT_ID" => build.fetch("accountId") },
      "pnpm", "exec", "wrangler", "containers", "list", "--json", out: log, err: [:child, :out]
    )
  end
  if inspected
    begin
      value = JSON.parse(File.read(container_log, encoding: "UTF-8"))
      applications = value.is_a?(Array) ? value : value["result"] || value["applications"] || []
      matches = applications.select { |application| application.fetch("name", nil) == container_app_name }
      abort "Unable to identify the API Container rollout state." unless matches.length == 1

      rollout_state = case matches.first.fetch("state", nil)
      when "degraded", "failed", "error" then "failed"
      when "active", "ready" then "completed"
      when "provisioning" then "progressing"
      else abort "Unable to identify the API Container rollout state."
      end
    rescue JSON::ParserError, NoMethodError, TypeError
      abort "Unable to identify the API Container rollout state."
    end
    abort "Container rollout entered a terminal failure state." if rollout_state == "failed"
  end

  if system(RbConfig.ruby, File.join(__dir__, "check-api-health.rb"))
    failures = 0
    successes = rollout_state == "completed" ? successes + 1 : 0
    exit 0 if successes >= 5
  else
    successes = 0
    if attempt <= startup_attempts
      failures = 0
      sleep 15
      next
    end
    failures += 1
    abort "API failed three consecutive health probes." if failures >= 3
  end
  sleep 15
end
abort "API rollout timed out before five consecutive readiness successes."
