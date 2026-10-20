#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"
require "securerandom"
require "timeout"

# cf owns local Hyperdrive emulation. This probe runs the candidate against
# the migrated Neon branch and removes its private log and process.
environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "Unsupported migration environment." unless %w[staging production].include?(environment)
branch_url = ENV.fetch("MIGRATION_BRANCH_URL")
abort "Neon must return a direct migration URL." if branch_url.empty? || branch_url.include?("-pooler.")
directory = File.join(ENV.fetch("GITHUB_WORKSPACE"), "apps/workers/auth")
log = File.join(ENV.fetch("RUNNER_TEMP"), "auth-migration-#{SecureRandom.hex(12)}.log")
pid = nil
Signal.trap("TERM") { exit(143) }
Signal.trap("INT") { exit(130) }
begin
  File.open(log, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |output|
    pid = Process.spawn({ "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB" => branch_url },
                        "pnpm", "exec", "cf", "dev", "--mode", environment,
                        "--host", "127.0.0.1", "--port", "8789",
                        chdir: directory, pgroup: true, out: output, err: output)
  end
  24.times do |attempt|
    statuses = %w[/v1/health/live /v1/health].map do |route|
      output, = Open3.capture2("curl", "--silent", "--connect-timeout", "5", "--max-time", "10",
                              "--output", File::NULL, "--write-out", "%{http_code}", "http://127.0.0.1:8789#{route}")
      output.strip
    end
    break if statuses == %w[204 200]

    abort "Candidate Auth failed migration-branch health probes." if attempt == 23
    sleep 5
  end
ensure
  begin
    if pid
      begin
        Process.kill("TERM", -pid)
      rescue Errno::ESRCH
        # cf may already have exited after a startup failure.
      end
      begin
        Timeout.timeout(10) { Process.wait(pid) }
      rescue Timeout::Error
        Process.kill("KILL", -pid)
        Process.wait(pid)
      rescue Errno::ECHILD
        # The process has already been reaped.
      end
    end
  ensure
    begin
      File.delete(log)
    rescue Errno::ENOENT
      # A failed startup may not have created the log.
    end
  end
end
