#!/usr/bin/env ruby
# frozen_string_literal: true

require_relative "bootstrap-runtime"
require_relative "cloudflare-bootstrap"
require_relative "github-bootstrap"
require_relative "google-cloud-bootstrap"
require_relative "infisical-bootstrap"
require_relative "meta-bootstrap"
require_relative "neon-bootstrap"
require_relative "upstash-bootstrap"

module Bootstrap
  module_function

  def _validate_local_authentication(platforms)
    checks = %w[tofu cf infisical gcloud gh neon].map do |tool|
      Thread.new { require_tool_async(tool) }.tap { |thread| thread.report_on_exception = false }
    end
    checks.each(&:value)
    identity = _cloudflare_parse_cf_json(run_async("cf", ["auth", "whoami"]), "authentication")
    account_id = platforms.fetch("cloudflare").fetch("account_id")
    authenticated_to_account = identity["authenticated"] == true && identity["tokenValid"] == true &&
      identity["accounts"].is_a?(Array) && identity.fetch("accounts").any? do |account|
        account.is_a?(Hash) && account["id"] == account_id
      end
    unless authenticated_to_account
      raise "cf is not authenticated to Cloudflare account #{account_id}."
    end
    repository = JSON.parse(run_async("gh", ["repo", "view", "--json", "nameWithOwner"]).fetch("stdout"))
                     .fetch("nameWithOwner")
    unless repository == platforms.fetch("github").fetch("repository")
      raise "Authenticated repository is #{repository}, expected #{platforms.fetch('github').fetch('repository')}."
    end
    run_async("gcloud", ["auth", "application-default", "print-access-token"])
    run_async("infisical", ["login", "status", "--json"])
    verify_neon_cli_authentication_async
  end

  def _get_infisical_token
    token = run_async("infisical", ["user", "get", "token", "--plain", "--silent"]).fetch("stdout").strip
    raise "Infisical CLI did not return an authenticated session." if token.empty?

    KNOWN_SECRETS.add(token)
    token
  end

  def main
    raise "infrastructure:bootstrap accepts no arguments." unless ARGV.empty?

    release_lock = acquire_lock
    begin
      start_bootstrap_ui
      platforms, manifest, github_oidc_subject_prefix = run_bootstrap_phase(
        pending: "Checking configuration and local authentication", complete: "Local prerequisites verified"
      ) do
        platforms = validate_platforms(platforms: JSON.parse(File.read(PLATFORMS_PATH, encoding: Encoding::UTF_8)))
        manifest = validate_manifest(manifest: JSON.parse(File.read(MANIFEST_PATH, encoding: Encoding::UTF_8)))
        _validate_local_authentication(platforms)
        [platforms, manifest, get_github_oidc_subject_prefix(platforms.fetch("github").fetch("repository"))]
      end
      infisical_token, infisical_project_id = run_bootstrap_phase(
        pending: "Reconciling the Infisical project", complete: "Infisical project ready"
      ) do
        token = _get_infisical_token
        project_id = reconcile_infisical_project({"platforms" => platforms, "manifest" => manifest}, token)
        [token, project_id]
      end
      run_bootstrap_phase(pending: "Reconciling Cloudflare remote state", complete: "Cloudflare remote state ready") do
        ensure_private_r2_bucket(platforms: platforms, manifest: manifest)
        ensure_bootstrap_folders(infisical_project_id, infisical_token)
        cloudflare_token = resolve_cloudflare_bootstrap_token(infisical_project_id, infisical_token)
        reconcile_r2_credentials(platforms: platforms, manifest: manifest, infisical_project_id: infisical_project_id,
                                 infisical_token: infisical_token, cloudflare_token: cloudflare_token)
      end
      run_bootstrap_phase(pending: "Reconciling generated secret folders", complete: "Generated secret folders ready") do
        apply_generated_folders(infisical_project_id, infisical_token)
      end
      run_bootstrap_phase(pending: "Reconciling provider credentials", complete: "Provider credentials ready") do
        reconcile_meta_app_secret(infisical_project_id: infisical_project_id, infisical_token: infisical_token)
        reconcile_upstash_api_key(platforms: platforms, infisical_project_id: infisical_project_id,
                                 infisical_token: infisical_token)
        reconcile_neon_account_api_key(platforms: platforms, manifest: manifest,
                                      infisical_project_id: infisical_project_id, infisical_token: infisical_token)
      end
      google_auth = run_bootstrap_phase(pending: "Reconciling Google Cloud and GitHub trust",
                                       complete: "Google Cloud trust ready") do
        reconcile_google_projects(platforms: platforms, manifest: manifest, infisical_project_id: infisical_project_id,
                                  infisical_token: infisical_token)
        apply_google_github_auth(infisical_project_id, infisical_token, github_oidc_subject_prefix)
      end
      run_bootstrap_phase(pending: "Reconciling CI execution identities", complete: "CI execution identities ready") do
        ENVIRONMENTS.each do |environment|
          identity_id = reconcile_infisical_identity(manifest: manifest, project_id: infisical_project_id,
                                                     infisical_token: infisical_token, environment: environment,
                                                     github_oidc_subject_prefix: github_oidc_subject_prefix)
          reconcile_github_environment(platforms: platforms, manifest: manifest, environment: environment,
                                       identity_id: identity_id, google_auth: google_auth)
        end
      end
      run_bootstrap_phase(pending: "Verifying remote state access", complete: "Remote state access verified") do
        ENVIRONMENTS.each do |environment|
          credentials = get_backend_credentials(infisical_project_id, infisical_token, environment)
          unless probe_r2_credentials(platforms: platforms, manifest: manifest,
                                      access_key_id: credentials.fetch("accessKeyId"),
                                      secret_access_key: credentials.fetch("secretAccessKey"))
            raise "Final #{environment} R2 verification failed."
          end
        end
      end
      finish_bootstrap_ui
    ensure
      release_lock.call
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    Bootstrap.main
  rescue StandardError, Interrupt => error
    Bootstrap.fail_bootstrap_ui(Bootstrap.redact_secrets(value: error.message, secrets: Bootstrap::KNOWN_SECRETS))
    exit(1)
  end
end
