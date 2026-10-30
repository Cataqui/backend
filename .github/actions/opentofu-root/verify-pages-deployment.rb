#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "net/http"
require "open3"
require "uri"

def _request(url:)
  uri = URI(url)
  request = Net::HTTP::Get.new(uri)
  Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 30) do |http|
    http.request(request)
  end
end

def _verify_pages_deployment(account_id:, project_name:, branch:, token:)
  credentials = { "CLOUDFLARE_ACCOUNT_ID" => account_id, "CLOUDFLARE_API_TOKEN" => token }
  output, status = Open3.capture2(credentials, "pnpm", "exec", "cf", "pages", "get", project_name)
  raise "Pages deployment inspection failed." unless status.success?

  project = JSON.parse(output.force_encoding("UTF-8"))

  # A disabled preview can be the project's latest deployment after the other branch is pushed.
  # Inspect production history so unrelated skipped previews cannot block domain activation.
  output, status = Open3.capture2(credentials, "pnpm", "exec", "cf", "pages", "deployments", "list", "--project-name", project_name,
                                 "--env", "production", "--per-page", "1")
  raise "Pages build history failed." unless status.success?

  history = JSON.parse(output.force_encoding("UTF-8"))
  deployment = history.first if history.is_a?(Array)
  valid = project.is_a?(Hash) && deployment.is_a?(Hash) &&
          project["name"] == project_name && project["production_branch"] == branch &&
          deployment["environment"] == "production" && deployment["id"].is_a?(String) &&
          !deployment["id"].empty? && deployment.dig("deployment_trigger", "metadata", "branch") == branch &&
          deployment.dig("latest_stage", "name") == "deploy" && deployment.dig("latest_stage", "status") == "success" &&
          project.dig("canonical_deployment", "id") == deployment["id"] &&
          project["subdomain"].is_a?(String) && project["subdomain"].match?(/\A[a-z0-9-]+\.pages\.dev\z/)
  raise "Pages build verification failed." unless valid

  # Net::HTTP does not follow redirects, matching the required direct HTTP 200 probe.
  response = _request(url: "https://#{project.fetch('subdomain')}/")
  raise "Pages landing probe failed." unless response.code == "200"
end

if $PROGRAM_NAME == __FILE__
  begin
    environment = ENV.fetch("INPUT_ENVIRONMENT")
    raise "Unsupported Pages environment." unless %w[staging production].include?(environment)

    output, status = Open3.capture2("tofu", "show", "-json", ARGV.fetch(0))
    raise "Pages plan inspection failed." unless status.success?

    plan = JSON.parse(output.force_encoding("UTF-8"))
    raise "Pages plan resource changes are missing." unless plan["resource_changes"].is_a?(Array)

    needs_verification = plan["resource_changes"].any? do |resource|
      resource["type"] == "cloudflare_pages_domain" && !resource.dig("change", "after").nil? &&
        resource.fetch("change").fetch("actions").any? { |action| %w[create update].include?(action) }
    end
    if needs_verification
      platforms = JSON.parse(File.read("../../../platforms.json", encoding: "UTF-8"))
      manifest = JSON.parse(File.read("../../../manifest.json", encoding: "UTF-8"))
      token = ENV.fetch("CLOUDFLARE_API_TOKEN")
      raise "Pages infrastructure credential is required." if token.empty?

      _verify_pages_deployment(
        account_id: platforms.fetch("cloudflare").fetch("account_id"),
        project_name: manifest.fetch("cloudflare").fetch("pages").fetch("landing_#{environment}").fetch("name"),
        branch: environment == "staging" ? "staging" : "main",
        token: token
      )
    end
  rescue StandardError
    warn "Pages build verification failed. Confirm the latest matching branch build succeeded and its pages.dev URL returns HTTP 200 before activating domains."
    exit 1
  end
end
