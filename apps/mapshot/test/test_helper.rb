# frozen_string_literal: true

if ENV["COVERAGE"] == "1"
  require "simplecov"
  require "coverage"

  unless Coverage.running?
    SimpleCov.start do
      root File.expand_path("../../..", __dir__)
      coverage_dir "apps/mapshot/coverage/ruby"
      command_name "Mapshot automation"
      enable_coverage :branch, :method
      cover "apps/mapshot/build/**/*.rb"
      cover "apps/mapshot/scripts/**/*.rb"
      skip "_test.rb"
      skip "test_helper.rb"
      minimum_coverage line: 90, branch: 90, method: 90
    end
  end
end

require "minitest/autorun"
