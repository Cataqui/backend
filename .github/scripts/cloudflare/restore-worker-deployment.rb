# frozen_string_literal: true

require "json"

build = JSON.parse(File.read(".cloudflare/output/v0/config.json", encoding: "UTF-8"))
worker = JSON.parse(File.read(".cloudflare/output/v0/workers/default/worker.config.json", encoding: "UTF-8"))
versions = JSON.parse(ENV.fetch("PREVIOUS_VERSIONS"))
abort "No previous Worker deployment exists to restore." if versions.empty?
body = JSON.generate({
  "strategy" => "percentage", "versions" => versions,
  "annotations" => { "workers/message" => "Automatic rollback after failed #{ENV.fetch('GITHUB_SHA')}" }
})
abort "Automatic Worker restoration failed." unless system(
  { "CLOUDFLARE_ACCOUNT_ID" => build.fetch("accountId") },
  "pnpm", "exec", "cf", "workers", "deployments", "create", "--worker", worker.fetch("name"),
  "--mode", ENV.fetch("INPUT_ENVIRONMENT"), "--body", body
)
