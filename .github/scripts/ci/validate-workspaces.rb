#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"

task = ARGV.fetch(0)
abort "Unsupported validation task." unless %w[typecheck test:cov build test:runtime].include?(task)
workspaces = JSON.parse(ENV.fetch("VALIDATION_WORKSPACES"))
exit 0 if workspaces.empty?
filters = workspaces.flat_map { |name| ["--filter", name] }
concurrency = %w[test:cov test:runtime].include?(task) ? ["--workspace-concurrency=1"] : []
exec "pnpm", "-r", *concurrency, *filters, "--if-present", "run", task
