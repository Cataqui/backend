#!/usr/bin/env ruby
# frozen_string_literal: true

require "rbconfig"
require "json"

environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "Unsupported deployment environment." unless %w[staging production].include?(environment)
File.umask(0o077)
previous_versions = JSON.parse(ENV.fetch("PREVIOUS_VERSIONS"))
deploy_log = File.join(ENV.fetch("RUNNER_TEMP"), "cataqui-api-deploy.log")
if previous_versions.empty?
  abort "API health failed during its first deployment; no prior Worker version exists to restore."
end

# cf restores the captured version; this gate waits for Cataquí's public API
# to recover, which the provider's deployment endpoint does not verify.
restored = File.open(deploy_log, "w", 0o600) do |log|
  system(
    RbConfig.ruby, File.join(ENV.fetch("GITHUB_WORKSPACE"), ".github/scripts/cloudflare/restore-worker-deployment.rb"),
    out: log, err: [:child, :out]
  )
end
abort "Automatic API rollback failed." unless restored
20.times do
  exit 0 if system(RbConfig.ruby, File.join(__dir__, "check-api-health.rb"))
  sleep 15
end
abort "API rollback completed but health did not recover."
