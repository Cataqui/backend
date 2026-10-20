# frozen_string_literal: true

if ENV["COVERAGE"] == "1"
  require "simplecov"

  SimpleCov.start do
    root File.expand_path("../../..", __dir__)
    coverage_dir "infrastructure/bootstrap/coverage"
    command_name "Infrastructure bootstrap"
    enable_coverage :branch, :method
    cover "infrastructure/bootstrap/**/*.rb"
    skip "/test/"
    minimum_coverage line: 90, branch: 90, method: 90
  end
end

require "minitest/autorun"
