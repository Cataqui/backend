#!/usr/bin/env ruby
# frozen_string_literal: true

require 'English'
require 'open3'

# Provider actions build the image and manage the branch; this probes their compatibility.
environment = ENV.fetch('INPUT_ENVIRONMENT')
abort('Unsupported migration environment.') unless %w[staging production].include?(environment)
branch_url = ENV.fetch('MIGRATION_BRANCH_URL')
abort('Neon must return a direct migration URL.') if branch_url.empty? || branch_url.include?('-pooler.')

container_name = "cataqui-api-migration-#{ENV.fetch('GITHUB_RUN_ID')}-#{ENV.fetch('GITHUB_RUN_ATTEMPT')}"
container_started = false
Signal.trap('TERM') { exit(143) }
Signal.trap('INT') { exit(130) }

runtime = {
  'ENVIRONMENT' => environment,
  'DATABASE_APP_POOLER_URL' => branch_url,
  'AI_GATEWAY_ID' => "cataqui-api-#{environment}",
  'CORS_ORIGINS' => environment == 'production' ? 'https://cataqui.com' : 'https://staging.cataqui.com'
}
names = %w[
  ENVIRONMENT CLOUDFLARE_ACCOUNT_ID DATABASE_APP_POOLER_URL CORS_ORIGINS
  AI_GATEWAY_API_TOKEN AI_GATEWAY_ID
  UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN
]

begin
  unless system(runtime, 'docker', 'run', '--detach', '--name', container_name,
                '--publish', '127.0.0.1:3000:3000', *names.flat_map { |name| ['-e', name] },
                "cataqui-api-candidate:#{ENV.fetch('GITHUB_SHA')}", out: File::NULL)
    exit($CHILD_STATUS&.exitstatus || 1)
  end
  container_started = true

  24.times do |attempt|
    statuses = %w[/v1/health/live /v1/health].map do |path|
      output, = Open3.capture2(
        'curl', '--silent', '--connect-timeout', '5', '--max-time', '10', '--output', File::NULL,
        '--write-out', '%{http_code}', # rubocop:disable Style/FormatStringToken -- curl owns the token syntax.
        "http://127.0.0.1:3000#{path}"
      )
      output.strip
    end
    break if statuses == %w[204 200]

    abort('Candidate API failed migration-branch probes.') if attempt == 23
    sleep(5)
  end

  exit($CHILD_STATUS&.exitstatus || 1) unless system('docker', 'rm', '-f', container_name, out: File::NULL)
  container_started = false
ensure
  system('docker', 'rm', '-f', container_name, out: File::NULL, err: File::NULL) if container_started
end
