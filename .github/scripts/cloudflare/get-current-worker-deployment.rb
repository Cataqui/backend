#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "open3"
require "tmpdir"

environment = ENV.fetch("INPUT_ENVIRONMENT")
abort "environment must be staging or production." unless %w[staging production].include?(environment)

# cf does not expose structured CLI errors. Wrangler's event stream distinguishes
# a missing first deployment from authorization and provider failures.
build = JSON.parse(File.read(".cloudflare/output/v0/config.json", encoding: "UTF-8"))
worker = JSON.parse(File.read(".cloudflare/output/v0/workers/default/worker.config.json", encoding: "UTF-8"))
File.umask(0o077)
Dir.mktmpdir("worker-deployment.", ENV.fetch("RUNNER_TEMP")) do |directory|
  events_path = File.join(directory, "events.jsonl")
  output, _error, status = Open3.capture3(
    { "CLOUDFLARE_ACCOUNT_ID" => build.fetch("accountId"), "WRANGLER_OUTPUT_FILE_PATH" => events_path },
    "pnpm", "exec", "wrangler", "deployments", "list",
    "--name", worker.fetch("name"), "--json"
  )
  unless status.success?
    begin
      failures = File.readlines(events_path, encoding: "UTF-8").map { |line| JSON.parse(line) }
                     .select { |event| event.is_a?(Hash) && event["type"] == "command-failed" }
      if failures.length == 1 && failures.first["code"] == 10_007
        puts "[]"
        exit 0
      end
    rescue Errno::ENOENT, JSON::ParserError
      # A missing or malformed event stream must never look like a first deployment.
    end
    warn "Cannot read the current Worker deployment; Wrangler inspection failed."
    exit(status.exitstatus || 1)
  end

  begin
    deployments = JSON.parse(output.force_encoding("UTF-8"))
  rescue JSON::ParserError
    abort "Invalid Wrangler deployment list."
  end
  abort "Invalid Wrangler deployment list." unless deployments.is_a?(Array)
  if deployments.empty?
    puts "[]"
    next
  end

  versions = deployments.last.is_a?(Hash) ? deployments.last["versions"] : nil
  valid = versions.is_a?(Array) && (1..2).cover?(versions.length) && versions.all? do |version|
    version.is_a?(Hash) &&
      version["version_id"].is_a?(String) &&
      version["version_id"].match?(/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i) &&
      version["percentage"].is_a?(Numeric) && (0..100).cover?(version["percentage"])
  end
  valid &&= versions.map { |version| version["version_id"] }.uniq.length == versions.length &&
            (versions.sum { |version| version["percentage"] } - 100).abs < 0.000001
  abort "Invalid Wrangler rollback versions." unless valid

  puts JSON.generate(versions.map { |version| version.slice("version_id", "percentage") })
end
