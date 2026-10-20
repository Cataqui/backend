# frozen_string_literal: true

require "json"
require "tempfile"

Signal.trap("TERM") { exit(143) }
Signal.trap("INT") { exit(130) }

# cf accepts secrets with the candidate version. Infisical's approved runtime
# profile owns the allowlist; deployment and migration credentials stay outside it.
profile_path = File.join(ENV.fetch("GITHUB_WORKSPACE"), ".github/actions/load-infisical-secrets/profiles.json")
profile = JSON.parse(File.read(profile_path, encoding: "UTF-8")).fetch(ENV.fetch("INPUT_RUNTIME_PROFILE"))
secrets = profile.fetch("required_secrets").to_h { |name| [name, ENV.fetch(name)] }
build = JSON.parse(File.read(".cloudflare/output/v0/config.json", encoding: "UTF-8"))
Tempfile.create(["worker-secrets-", ".json"], ENV.fetch("RUNNER_TEMP")) do |file|
  file.write(JSON.generate(secrets))
  file.flush
  arguments = ["exec", "cf", "deploy", "--prebuilt", "--mode", ENV.fetch("INPUT_ENVIRONMENT"),
               "--provision=false", "--secrets-file", file.path,
               "--tag", ENV.fetch("GITHUB_SHA"), "--message", "Deploy #{ENV.fetch('GITHUB_SHA')}"]
  rollout = ENV.fetch("CONTAINERS_ROLLOUT", nil)
  arguments.concat(["--containers-rollout", rollout]) if rollout
  abort "Worker deployment failed." unless system({ "CLOUDFLARE_ACCOUNT_ID" => build.fetch("accountId") }, "pnpm",
                                                  *arguments)
end
