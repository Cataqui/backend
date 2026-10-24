# frozen_string_literal: true

require_relative "test_helper"
require "json"
require "securerandom"

Dir[File.expand_path("../*-reconciliation.rb", __dir__)].each { |path| require path }
require_relative "../reconciliation"

class InfrastructureBootstrapTest < Minitest::Test
  def setup
    @manifest = JSON.parse(File.read(File.expand_path("../../manifest.json", __dir__), encoding: Encoding::UTF_8))
    @platform_coordinates = JSON.parse(File.read(File.expand_path("../../platforms.json", __dir__), encoding: Encoding::UTF_8))
    @platforms = @platform_coordinates.merge(
      "infisical" => @platform_coordinates.fetch("infisical").merge("project" => @manifest.dig("infisical", "project"))
    )
  end

  def test_accepts_only_the_configured_repositorys_immutable_github_oidc_subject_prefix
    prefix = "repo:Cataqui@288484515/backend@1252587238"
    assert_equal prefix, Bootstrap.parse_github_oidc_subject_prefix(
      repository: "Cataqui/backend", payload: { "sub_claim_prefix" => prefix }
    )
    ["repo:Cataqui/backend", "repo:Foreign@288484515/backend@1252587238", nil].each do |invalid|
      _assert_error("invalid immutable OIDC subject prefix") do
        Bootstrap.parse_github_oidc_subject_prefix(
          repository: "Cataqui/backend", payload: invalid && { "sub_claim_prefix" => invalid }
        )
      end
    end
  end

  def test_fails_closed_on_ambiguous_or_unavailable_folder_inventories_before_creation
    created = false
    create_folder = proc { created = true }
    [nil, [{ "name" => "manual" }, { "name" => "manual" }]].each do |inventory|
      _assert_error do
        Bootstrap.reconcile_infisical_folder_state(
          name: "manual", list_folders: proc { inventory }, create_folder: create_folder
        )
      end
    end
    _assert_error("Provider unavailable") do
      Bootstrap.reconcile_infisical_folder_state(
        name: "manual", list_folders: proc { raise "Provider unavailable" }, create_folder: create_folder
      )
    end
    refute created
  end

  def test_verifies_folder_creation_and_preserves_failures_instead_of_reporting_success
    [nil, [], [{ "name" => "manual" }, { "name" => "manual" }]].each do |verified|
      reads = 0
      _assert_error do
        Bootstrap.reconcile_infisical_folder_state(
          name: "manual", list_folders: proc { reads += 1; reads == 1 ? [] : verified }, create_folder: proc {}
        )
      end
    end
    _assert_error("Creation rejected") do
      Bootstrap.reconcile_infisical_folder_state(
        name: "manual", list_folders: proc { [] }, create_folder: proc { raise "Creation rejected" }
      )
    end
  end

  def test_rejects_missing_unknown_or_malformed_pages_project_identities
    pages = @manifest.dig("cloudflare", "pages")
    [{}, pages.merge("unknown" => {}), pages.merge("landing_staging" => { "name" => "INVALID PROJECT" })].each do |invalid|
      @manifest.fetch("cloudflare")["pages"] = invalid
      _assert_error("manifest.cloudflare.pages") { Bootstrap.validate_manifest(manifest: @manifest) }
    end
  end

  def test_rejects_sharing_a_pages_project_between_staging_and_production
    @manifest.dig("cloudflare", "pages")["landing_production"] = @manifest.dig("cloudflare", "pages", "landing_staging")
    _assert_error("two distinct landing projects") { Bootstrap.validate_manifest(manifest: @manifest) }
  end

  def test_validates_auth_infrastructure_names_and_shapes
    @manifest["cloudflare"]["hyperdrive"]["auth_staging"]["name"] = "invalid name"
    _assert_error("hyperdrive.auth_staging.name") { Bootstrap.validate_manifest(manifest: @manifest) }
  end

  def test_rejects_auth_database_with_missing_runtime_role
    @manifest["neon"]["databases"]["auth"].delete("runtime_role")
    _assert_error("manifest.neon.databases.auth") { Bootstrap.validate_manifest(manifest: @manifest) }
  end

  def test_rejects_invalid_auth_redis_database_name
    @manifest["upstash"]["redis"]["databases"]["cataqui_auth_production"]["name"] = "invalid name"
    _assert_error("cataqui_auth_production.name") { Bootstrap.validate_manifest(manifest: @manifest) }
  end

  def test_accepts_the_committed_stable_bootstrap_contract
    assert_same @platform_coordinates, Bootstrap.validate_platforms(platforms: @platform_coordinates)
    assert_same @manifest, Bootstrap.validate_manifest(manifest: @manifest)
    assert_equal({
      "opentofu_state" => "cataqui-backend-opentofu-state",
      "mapshot_staging" => "cataqui-mapshot-staging",
      "mapshot_production" => "cataqui-mapshot-production"
    }, @manifest.dig("cloudflare", "r2", "buckets"))
    assert_equal({
      "api_staging" => "cataqui-api-staging",
      "api_production" => "cataqui-api-production",
      "ai_staging" => "cataqui-ai-worker-staging",
      "ai_production" => "cataqui-ai-worker-production"
    }, @manifest.dig("cloudflare", "ai_gateways"))
    assert_equal "cataqui-backend-opentofu-state-staging", Bootstrap.get_r2_token_name(manifest: @manifest, environment: "staging")
    assert_equal "cataqui-backend-opentofu-state-production", Bootstrap.get_r2_token_name(manifest: @manifest, environment: "production")
    assert_equal({
      "cataqui_staging" => { "name" => "cataqui-staging", "id" => "cataqui-staging-mre5wge" },
      "cataqui_production" => { "name" => "cataqui-production", "id" => "cataqui-production-jd7bfto" }
    }, @manifest.dig("google_cloud", "projects"))
    assert_equal({
      "cataqui_backend_staging" => "cataqui-backend-opentofu-stg",
      "cataqui_backend_production" => "cataqui-backend-opentofu-prod"
    }, @manifest.dig("google_cloud", "github_auth", "service_accounts"))
    assert_equal({
      "cataqui_backend_staging" => "cataqui-backend-opentofu-staging",
      "cataqui_backend_production" => "cataqui-backend-opentofu-production"
    }, @manifest.dig("infisical", "opentofu_identities"))
    assert_equal "33687647-d8e9-44a7-9cb9-721bd5b28a45", @platform_coordinates.dig("infisical", "organization_id")
    assert_equal({ "name" => "Cataquí Backend", "slug" => "cataqui-backend-6xt3g" }, @manifest.dig("infisical", "project"))
    assert_equal({ "staging" => { "branches" => ["staging"] }, "production" => { "branches" => ["main"] } }, @manifest.dig("github", "environments"))
    assert_equal({ "account_email" => "ryan@ventairy.com" }, @platform_coordinates.fetch("upstash"))
    expected_projects = {
      "cataqui_staging" => { "name" => "cataqui-staging" },
      "cataqui_production" => { "name" => "cataqui-production" }
    }
    assert_equal({
      "cataqui_api_staging" => { "name" => "cataqui-api-staging" },
      "cataqui_api_production" => { "name" => "cataqui-api-production" },
      "cataqui_auth_staging" => { "name" => "cataqui-auth-staging" },
      "cataqui_auth_production" => { "name" => "cataqui-auth-production" }
    }, @manifest.dig("upstash", "redis", "databases"))
    assert_equal expected_projects, @manifest.dig("neon", "projects")
    assert_equal({
      "account_bootstrap" => { "name" => "cataqui-backend-opentofu-bootstrap" },
      "project_access" => {
        "cataqui_staging" => { "name" => "cataqui-backend-project-access-staging" },
        "cataqui_production" => { "name" => "cataqui-backend-project-access-production" }
      }
    }, @manifest.dig("neon", "api_keys"))
    assert_equal({
      "cataqui" => { "name" => "cataqui", "owner_role" => "db_owner", "runtime_role" => "db_user" },
      "auth" => { "name" => "auth", "owner_role" => "auth_owner", "runtime_role" => "auth_user" }
    }, @manifest.dig("neon", "databases"))
  end

  def test_rejects_invalid_app_gateway_identifiers
    %w[api_staging api_production ai_staging ai_production].each do |key|
      invalid = Marshal.load(Marshal.dump(@manifest))
      invalid["cloudflare"]["ai_gateways"][key] = "invalid gateway"
      _assert_error("cloudflare.ai_gateways.#{key}") { Bootstrap.validate_manifest(manifest: invalid) }
    end
  end

  %w[staging production].each do |environment|
    define_method("test_rejects_an_invalid_#{environment}_mapshot_bucket_name") do
      @manifest.dig("cloudflare", "r2", "buckets")["mapshot_#{environment}"] = "INVALID BUCKET"
      _assert_error("manifest.cloudflare.r2.buckets.mapshot") { Bootstrap.validate_manifest(manifest: @manifest) }
    end
  end

  %w[opentofu_state mapshot_staging].each do |bucket|
    define_method("test_rejects_sharing_the_production_mapshot_bucket_with_#{bucket}") do
      buckets = @manifest.dig("cloudflare", "r2", "buckets")
      buckets["mapshot_production"] = buckets.fetch(bucket)
      _assert_error("distinct state, staging and production buckets") { Bootstrap.validate_manifest(manifest: @manifest) }
    end
  end

  def test_rejects_undeclared_github_environment_policy_fields
    @manifest.dig("github", "environments")["production"] = { "branches" => ["main"], "bypass" => true }
    _assert_error("Unexpected keys in infrastructure configuration object: manifest.github.environments.production") do
      Bootstrap.validate_manifest(manifest: @manifest)
    end
  end

  def test_rejects_invalid_and_unexpected_external_platform_values
    [
      ["cloudflare", "account_id", "secret", "cloudflare.account_id"],
      ["infisical", "api_url", "https://example.com", "Unexpected keys in infrastructure configuration object: platforms.infisical"],
      ["google_cloud", "project_id", "forbidden", "Unexpected keys in infrastructure configuration object: platforms.google_cloud"],
      ["upstash", "account_email", "not-an-email", "upstash.account_email"],
      ["upstash", "api_key", "forbidden", "Unexpected keys in infrastructure configuration object: platforms.upstash"]
    ].each do |provider, key, value, message|
      invalid = Marshal.load(Marshal.dump(@platform_coordinates))
      invalid.fetch(provider)[key] = value
      _assert_error(message) { Bootstrap.validate_platforms(platforms: invalid) }
    end
  end

  def test_rejects_invalid_and_unexpected_desired_infrastructure_values
    changes = [
      [proc { |value| value.dig("google_cloud", "projects")["legacy_id"] = "legacy" }, "Unexpected keys"],
      [proc { |value| value.fetch("github")["environments"] = nil }, "Invalid infrastructure configuration object"],
      [proc { |value| value.dig("infisical", "project")["id"] = SecureRandom.uuid }, "manifest.infisical.project"],
      [proc { |value| value.fetch("cloudflare")["api_token"] = "forbidden" }, "manifest.cloudflare"],
      [proc { |value| value.dig("github", "environments")["staging"] = { "branches" => [] } }, "Invalid branch policy"]
    ]
    changes.each do |change, message|
      invalid = Marshal.load(Marshal.dump(@manifest))
      change.call(invalid)
      _assert_error(message) { Bootstrap.validate_manifest(manifest: invalid) }
    end
  end

  def test_creates_or_reuses_the_exact_infisical_project_by_stable_slug
    expected = _expected_infisical_project
    assert_equal({ "action" => "create" }, Bootstrap.decide_infisical_project(projects: [], **expected))
    project = _infisical_project
    assert_equal({ "action" => "reuse", "project" => project }, Bootstrap.decide_infisical_project(projects: [project], **expected))
    drifted = project.merge("name" => "Drifted", "hasDeleteProtection" => false)
    assert_equal "reconcile", Bootstrap.decide_infisical_project(projects: [drifted], **expected).fetch("action")
  end

  def test_recognizes_infisicals_exact_missing_oidc_response_without_hiding_other_failures
    assert_equal "present", Bootstrap.classify_infisical_oidc_inspection(status: 200, payload: {})
    assert_equal "missing", Bootstrap.classify_infisical_oidc_inspection(status: 404, payload: {})
    assert_equal "missing", Bootstrap.classify_infisical_oidc_inspection(
      status: 400, payload: { "message" => "The identity does not have OIDC Auth attached" }
    )
    [[400, { "message" => "Invalid identity" }], [403, {}]].each do |status, payload|
      _assert_error("Unable to inspect Infisical OIDC trust (#{status})") do
        Bootstrap.classify_infisical_oidc_inspection(status: status, payload: payload)
      end
    end
  end

  def test_explains_exhausted_infisical_identity_capacity_without_weakening_environment_isolation
    provider_error = RuntimeError.new("Failed to create identity due to identity limit reached. Upgrade plan to create more identities.")
    _assert_error("Infisical identity capacity is exhausted. The production environment requires its own OIDC identity to preserve staging and production isolation.") do
      raise Bootstrap.explain_infisical_identity_creation_failure(error: provider_error, environment: "production")
    end
    provider_error = RuntimeError.new("Infisical request failed with 503.")
    assert_same provider_error, Bootstrap.explain_infisical_identity_creation_failure(error: provider_error, environment: "staging")
  end

  def test_recognizes_only_the_exact_infisical_additional_privilege_conflict
    assert Bootstrap.is_infisical_privilege_already_present(
      error: RuntimeError.new("Additional privilege with name opentofu-staging exists"), privilege_slug: "opentofu-staging"
    )
    refute Bootstrap.is_infisical_privilege_already_present(error: RuntimeError.new("Permission denied"), privilege_slug: "opentofu-staging")
  end

  def test_resolves_infisical_additional_privileges_by_slug
    privilege = { "id" => "privilege-id", "slug" => "opentofu-staging" }
    assert_same privilege, Bootstrap.resolve_infisical_privilege(privileges: [privilege], privilege_slug: "opentofu-staging")
    assert_nil Bootstrap.resolve_infisical_privilege(privileges: [], privilege_slug: "opentofu-staging")
    _assert_error("Duplicate Infisical privileges use slug opentofu-staging") do
      Bootstrap.resolve_infisical_privilege(privileges: [privilege, privilege.merge("id" => "duplicate")], privilege_slug: "opentofu-staging")
    end
  end

  def test_repairs_missing_infisical_environments_while_preserving_additional_ones
    project = { "environments" => [{ "slug" => "staging" }, { "slug" => "development" }] }
    assert_equal ["production"], Bootstrap.get_missing_infisical_environments(project: project)
    project.fetch("environments") << { "slug" => "production" }
    assert_equal [], Bootstrap.get_missing_infisical_environments(project: project)
  end

  def test_fails_closed_for_ambiguous_or_foreign_infisical_project_ownership
    expected = _expected_infisical_project
    project = _infisical_project
    [
      [[project, project.merge("id" => "duplicate")], "Duplicate Infisical projects"],
      [[project.merge("orgId" => SecureRandom.uuid)], "foreign organization"],
      [[project.merge("type" => "kms")], "not a secret-manager"]
    ].each do |projects, message|
      _assert_error(message) { Bootstrap.decide_infisical_project(projects: projects, **expected) }
    end
    [[], [project, project.merge("orgId" => SecureRandom.uuid)]].each do |projects|
      _assert_error("not scoped exclusively") do
        Bootstrap.assert_infisical_organization_scope(projects: projects, expected_organization_id: expected.fetch(:expected_organization_id))
      end
    end
    _assert_error("Duplicate Infisical environment") do
      Bootstrap.get_missing_infisical_environments(project: { "environments" => [{ "slug" => "staging" }, { "slug" => "staging" }] })
    end
  end

  def test_verifies_the_final_infisical_project_contract_after_interrupted_reconciliation
    project = _infisical_project.merge("environments" => %w[staging production development].map { |slug| { "slug" => slug } })
    assert_same project, Bootstrap.assert_infisical_project_contract(project: project, **_expected_infisical_project)
    _assert_error("failed final verification") do
      Bootstrap.assert_infisical_project_contract(
        project: project.merge("environments" => [{ "slug" => "staging" }]), **_expected_infisical_project
      )
    end
  end

  def test_creates_the_infisical_project_and_both_environments_in_dependency_order
    existing = _infisical_project.merge("id" => "existing-project", "name" => "Existing", "slug" => "existing")
    created = _infisical_project.merge("id" => "created-project")
    events = []
    result = Bootstrap.reconcile_infisical_project_state(
      **_expected_infisical_project,
      list_projects: proc { events << "list"; [existing, *(events.length > 1 ? [created] : [])] },
      create_project: proc { events << "create-project"; created },
      update_project: proc { raise "unexpected update" },
      create_environment: proc do |input|
        environment = input.fetch("environment")
        events << "create-environment:#{environment}"
        created.fetch("environments") << {
          "name" => environment == "staging" ? "Staging" : "Production",
          "slug" => environment, "position" => environment == "staging" ? 1 : 2
        }
      end
    )
    assert_equal "created-project", result
    assert_equal(%w[staging production], created.fetch("environments").map { |environment| environment.fetch("slug") })
    assert_equal ["list", "create-project", "list", "create-environment:staging", "create-environment:production", "list"], events
  end

  def test_finishes_an_interrupted_infisical_project_and_repairs_mutable_drift
    project = _infisical_project.merge("name" => "Drifted name", "hasDeleteProtection" => false, "environments" => [{ "slug" => "staging" }])
    events = []
    result = Bootstrap.reconcile_infisical_project_state(
      **_expected_infisical_project,
      list_projects: proc { [project] }, create_project: proc { raise "unexpected create" },
      update_project: proc do
        events << "update"
        project["name"] = @platforms.dig("infisical", "project", "name")
        project["hasDeleteProtection"] = true
        project
      end,
      create_environment: proc do |input|
        environment = input.fetch("environment")
        events << "environment:#{environment}"
        project.fetch("environments") << { "slug" => environment }
      end
    )
    assert_equal "project-id", result
    assert_equal ["update", "environment:production"], events
  end

  def test_performs_no_infisical_writes_for_a_healthy_project_and_propagates_inspection_failures
    project = _infisical_project.merge("environments" => [{ "slug" => "staging" }, { "slug" => "production" }])
    events = []
    result = Bootstrap.reconcile_infisical_project_state(
      **_expected_infisical_project, list_projects: proc { events << "list"; [project] },
      create_project: proc { events << "create" }, update_project: proc { events << "update" },
      create_environment: proc { events << "environment" }
    )
    assert_equal "project-id", result
    assert_equal ["list", "list"], events
    [401, 503].each do |status|
      _assert_error("failed with #{status}") do
        Bootstrap.reconcile_infisical_project_state(
          **_expected_infisical_project, list_projects: proc { raise "GET /api/v1/projects failed with #{status}" },
          create_project: proc {}, update_project: proc {}, create_environment: proc {}
        )
      end
    end
  end

  [
    [200, "accepted"],
    [204, "accepted"],
    [401, "rejected"],
    [403, "rejected"],
    [408, "indeterminate"],
    [429, "indeterminate"],
    [500, "indeterminate"]
  ].each do |status, expected|
    define_method("test_classifies_upstash_credential_response_#{status}") do
      assert_equal expected, Bootstrap.classify_upstash_credential_response(status: status)
    end
  end

  def test_reuses_a_healthy_shared_upstash_key_and_repairs_one_missing_environment
    api_key = SecureRandom.uuid
    assert_equal(
      { "action" => "reuse", "writeEnvironments" => [] },
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => api_key, "production" => api_key },
        credential_status: "accepted"
      )
    )
    assert_equal(
      { "action" => "reuse", "writeEnvironments" => ["production"] },
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => api_key, "production" => nil },
        credential_status: "accepted"
      )
    )
  end

  def test_requests_or_replaces_the_shared_upstash_key_only_when_missing_or_rejected
    api_key = SecureRandom.uuid
    assert_equal(
      { "action" => "request", "writeEnvironments" => ["staging", "production"] },
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => nil, "production" => nil },
        credential_status: "missing"
      )
    )
    assert_equal(
      { "action" => "replace", "writeEnvironments" => ["staging", "production"] },
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => api_key, "production" => api_key },
        credential_status: "rejected"
      )
    )
  end

  def test_fails_closed_for_conflicting_or_indeterminate_upstash_credentials
    _assert_error("different Upstash bootstrap API keys") do
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => SecureRandom.uuid, "production" => SecureRandom.uuid },
        credential_status: "accepted"
      )
    end
    _assert_error("Unable to determine") do
      Bootstrap.decide_upstash_credential(
        stored_by_environment: { "staging" => SecureRandom.uuid, "production" => nil },
        credential_status: "indeterminate"
      )
    end
  end

  def test_prompts_once_and_writes_both_environments_on_first_upstash_bootstrap
    api_key = SecureRandom.uuid
    events = []
    result = Bootstrap.reconcile_upstash_credential(
      stored_by_environment: { "staging" => nil, "production" => nil },
      verify_key: proc { |key| key == api_key ? "accepted" : "rejected" },
      request_key: proc do
        events.push("prompt")
        api_key
      end,
      write_key: proc { |environment| events.push("write:#{environment}") }
    )
    assert_equal({ "action" => "request", "writtenEnvironments" => ["staging", "production"] }, result)
    assert_equal ["prompt", "write:staging", "write:production"], events
  end

  def test_repairs_or_reuses_healthy_upstash_credentials_without_prompting_or_rotation
    api_key = SecureRandom.uuid
    events = []
    request_key = proc do
      events.push("prompt")
      SecureRandom.uuid
    end
    Bootstrap.reconcile_upstash_credential(
      stored_by_environment: { "staging" => api_key, "production" => nil },
      verify_key: proc { "accepted" },
      request_key: request_key,
      write_key: proc { |environment| events.push("write:#{environment}") }
    )
    assert_equal ["write:production"], events
    events.clear
    Bootstrap.reconcile_upstash_credential(
      stored_by_environment: { "staging" => api_key, "production" => api_key },
      verify_key: proc { "accepted" },
      request_key: request_key,
      write_key: proc { |environment| events.push("write:#{environment}") }
    )
    assert_equal [], events
  end

  def test_replaces_a_rejected_upstash_key_but_never_writes_after_an_indeterminate_replacement_check
    stored_key = SecureRandom.uuid
    replacement_key = SecureRandom.uuid
    events = []
    Bootstrap.reconcile_upstash_credential(
      stored_by_environment: { "staging" => stored_key, "production" => stored_key },
      verify_key: proc { |key| key == stored_key ? "rejected" : "accepted" },
      request_key: proc { replacement_key },
      write_key: proc { |environment| events.push("write:#{environment}") }
    )
    assert_equal ["write:staging", "write:production"], events

    events.clear
    _assert_error("Unable to verify the supplied Upstash bootstrap API key") do
      Bootstrap.reconcile_upstash_credential(
        stored_by_environment: { "staging" => stored_key, "production" => stored_key },
        verify_key: proc { |key| key == stored_key ? "rejected" : "indeterminate" },
        request_key: proc { replacement_key },
        write_key: proc { |environment| events.push("write:#{environment}") }
      )
    end
    assert_equal [], events

    _assert_error("supplied Upstash bootstrap API key is invalid") do
      Bootstrap.reconcile_upstash_credential(
        stored_by_environment: { "staging" => stored_key, "production" => stored_key },
        verify_key: proc { "rejected" },
        request_key: proc { replacement_key },
        write_key: proc { |environment| events.push("write:#{environment}") }
      )
    end
    assert_equal [], events
  end

  def test_reuses_one_healthy_owned_resource_and_fails_closed_on_duplicates_or_foreign_ownership
    resource = { "id" => "1", "name" => "expected", "owner" => "cataqui" }
    assert_equal(
      resource,
      Bootstrap.resolve_unique_named_resource(
        resources: [resource],
        expected_name: "expected",
        owner_predicate: proc { |item| item["owner"] == "cataqui" }
      )
    )
    assert_nil Bootstrap.resolve_unique_named_resource(resources: [], expected_name: "expected")
    assert_equal(
      { "id" => "1", "name" => "expected" },
      Bootstrap.resolve_unique_named_resource(
        resources: [{ "id" => "1", "name" => "expected" }],
        expected_name: "expected"
      )
    )
    _assert_error("Foreign resource") do
      Bootstrap.resolve_unique_named_resource(
        resources: [{ "id" => "1", "name" => "expected", "owner" => "foreign" }],
        expected_name: "expected",
        owner_predicate: proc { |item| item["owner"] == "cataqui" }
      )
    end
    _assert_error("Duplicate bootstrap ownership") do
      Bootstrap.resolve_unique_named_resource(
        resources: [{ "id" => "1", "name" => "expected" }, { "id" => "2", "name" => "expected" }],
        expected_name: "expected"
      )
    end
  end

  [
    [{ token: nil, access_key_id: nil, secret_access_key: nil, probe_succeeded: false }, "create"],
    [{ token: { "id" => "id", "status" => "active" }, access_key_id: "id", secret_access_key: "secret", probe_succeeded: true }, "reuse"],
    [{ token: { "id" => "id", "status" => "active" }, access_key_id: "id", secret_access_key: "secret", probe_succeeded: false }, "replace"],
    [{ token: { "id" => "id", "status" => "active" }, access_key_id: nil, secret_access_key: "secret", probe_succeeded: false }, "replace"],
    [{ token: { "id" => "other", "status" => "active" }, access_key_id: "id", secret_access_key: "secret", probe_succeeded: true }, "replace"],
    [{ token: { "id" => "id", "status" => "disabled" }, access_key_id: "id", secret_access_key: "secret", probe_succeeded: true }, "replace"],
    [{ token: nil, access_key_id: "id", secret_access_key: "secret", probe_succeeded: true }, "replace"]
  ].each_with_index do |(input, expected), index|
    define_method("test_chooses_the_safe_r2_credential_action_#{index}") do
      assert_equal expected, Bootstrap.decide_r2_credentials(**input)
    end
  end

  def test_reconciles_staging_and_production_meta_app_secrets_independently
    staging_secret = SecureRandom.uuid
    production_secret = SecureRandom.uuid
    assert_equal(
      { "action" => "reuse", "environments" => [] },
      Bootstrap.decide_meta_app_secret(
        stored_by_environment: { "staging" => staging_secret, "production" => production_secret }
      )
    )
    assert_equal(
      { "action" => "prompt", "environments" => ["production"] },
      Bootstrap.decide_meta_app_secret(stored_by_environment: { "staging" => staging_secret, "production" => nil })
    )
    writes = []
    result = Bootstrap.reconcile_meta_app_secret_state(
      stored_by_environment: { "staging" => nil, "production" => nil },
      request_secret: proc { |environment| environment == "staging" ? staging_secret : production_secret },
      write_secret: proc { |environment, value| writes.push([environment, value]) }
    )
    assert_equal({ "action" => "prompt", "environments" => ["staging", "production"] }, result)
    assert_equal [["staging", staging_secret], ["production", production_secret]], writes
  end

  def test_replaces_an_accidentally_shared_meta_app_secret_with_environment_specific_values
    shared_secret = SecureRandom.uuid
    prompts = []
    writes = []
    result = Bootstrap.reconcile_meta_app_secret_state(
      stored_by_environment: { "staging" => shared_secret, "production" => shared_secret },
      request_secret: proc do |environment|
        prompts.push(environment)
        SecureRandom.uuid
      end,
      write_secret: proc { |environment| writes.push(environment) }
    )
    assert_equal({ "action" => "replace-shared", "environments" => ["staging", "production"] }, result)
    assert_equal ["staging", "production"], prompts
    assert_equal ["staging", "production"], writes
  end

  [
    [200, "accepted"],
    [204, "accepted"],
    [401, "rejected"],
    [403, "rejected"],
    [408, "indeterminate"],
    [429, "indeterminate"],
    [500, "indeterminate"]
  ].each do |status, expected|
    define_method("test_distinguishes_expired_credentials_from_interrupted_provider_checks_#{status}") do
      assert_equal expected, Bootstrap.classify_credential_response(status: status)
    end
  end

  [
    [200, "accepted"],
    [204, "accepted"],
    [401, "rejected"],
    [403, "indeterminate"],
    [404, "indeterminate"],
    [408, "indeterminate"],
    [429, "indeterminate"],
    [500, "indeterminate"]
  ].each do |status, expected|
    define_method("test_classifies_neon_credential_verification_response_#{status}") do
      assert_equal expected, Bootstrap.classify_neon_credential_response(status: status)
    end
  end

  def test_resolves_stable_neon_account_and_project_key_names_from_the_manifest
    assert_equal "cataqui-backend-opentofu-bootstrap", Bootstrap.get_neon_account_api_key_name(manifest: @manifest)
    assert_equal(
      "cataqui-backend-project-access-staging",
      Bootstrap.get_neon_project_api_key_name(manifest: @manifest, environment: "staging")
    )
    assert_equal(
      "cataqui-backend-project-access-production",
      Bootstrap.get_neon_project_api_key_name(manifest: @manifest, environment: "production")
    )
  end

  def test_accepts_neon_account_key_creation_metadata_without_weakening_scope_validation
    name = "cataqui-backend-opentofu-bootstrap"
    key = SecureRandom.uuid
    assert_equal(
      { "id" => 41, "name" => name, "key" => key },
      Bootstrap.normalize_created_neon_account_api_key(
        payload: {
          "id" => 41,
          "name" => name,
          "key" => key,
          "created_at" => "2026-01-01T00:00:00Z",
          "created_by" => { "id" => SecureRandom.uuid }
        },
        expected_name: name
      )
    )
    _assert_error("invalid credentials") do
      Bootstrap.normalize_created_neon_account_api_key(
        payload: { "id" => 1, "name" => name, "key" => key, "project_id" => "foreign-project" },
        expected_name: name
      )
    end
  end

  def test_reuses_or_repairs_one_healthy_shared_neon_account_key
    expected_name = "cataqui-backend-opentofu-bootstrap"
    key = SecureRandom.uuid
    inventory = [{ "id" => 41, "name" => expected_name, "project_id" => nil }]
    assert_equal(
      { "action" => "reuse", "keyId" => "41", "missingEnvironments" => [] },
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: {
          "staging" => { "key" => key, "id" => "41" },
          "production" => { "key" => key, "id" => "41" }
        },
        inventory: inventory,
        credential_status: "accepted"
      )
    )
    assert_equal(
      { "action" => "repair", "keyId" => "41", "missingEnvironments" => ["production"] },
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: { "staging" => { "key" => key, "id" => "41" }, "production" => {} },
        inventory: inventory,
        credential_status: "accepted"
      )
    )
  end

  def test_repairs_empty_neon_account_key_ids_without_rotating_the_healthy_shared_key
    expected_name = "cataqui-backend-opentofu-bootstrap"
    key = SecureRandom.uuid
    [
      [{ "staging" => "", "production" => "42" }, ["staging"]],
      [{ "staging" => "42", "production" => "" }, ["production"]],
      [{ "staging" => "", "production" => "" }, %w[staging production]]
    ].each do |ids, targets|
      writes = []
      result = Bootstrap.reconcile_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: {
          "staging" => { "key" => key, "id" => ids.fetch("staging") },
          "production" => { "key" => key, "id" => ids.fetch("production") }
        },
        inventory: [{ "id" => 42, "name" => expected_name }],
        verify_key: proc { |value| assert_equal key, value; "accepted" },
        revoke_key: proc { flunk "A healthy account key must not be revoked to repair metadata." },
        create_key: proc { flunk "A healthy account key must not be replaced to repair metadata." },
        write_key: proc { |environment, value| writes.push([environment, "key", value]) },
        write_key_id: proc { |environment, value| writes.push([environment, "id", value]) }
      )
      assert_equal({ "action" => "repair", "keyId" => "42" }, result)
      assert_equal targets.flat_map { |environment| [[environment, "key", key], [environment, "id", "42"]] }, writes
    end
  end

  def test_rejects_a_created_neon_account_key_with_an_empty_id_before_writing_credentials
    _assert_error("Neon did not return a complete account API key") do
      Bootstrap.reconcile_neon_account_credential(
        expected_name: "cataqui-backend-opentofu-bootstrap",
        stored_by_environment: {},
        inventory: [],
        verify_key: proc { flunk "No stored credential exists to verify." },
        revoke_key: proc { flunk "No owned credential exists to revoke." },
        create_key: proc { { "id" => "", "key" => SecureRandom.uuid } },
        write_key: proc { flunk "Incomplete credentials must not be stored." },
        write_key_id: proc { flunk "Incomplete metadata must not be stored." }
      )
    end
  end

  def test_creates_a_missing_neon_account_key_and_replaces_one_invalid_owned_key
    expected_name = "cataqui-backend-opentofu-bootstrap"
    assert_equal(
      { "action" => "create" },
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: { "staging" => {}, "production" => {} },
        inventory: [],
        credential_status: "missing"
      )
    )
    assert_equal(
      { "action" => "replace", "keyId" => "51" },
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: { "staging" => {}, "production" => {} },
        inventory: [{ "id" => 51, "name" => expected_name, "project_id" => nil }],
        credential_status: "missing"
      )
    )
    assert_equal(
      { "action" => "replace", "keyId" => "52" },
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: {
          "staging" => { "key" => SecureRandom.uuid, "id" => "52" },
          "production" => { "key" => nil, "id" => nil }
        },
        inventory: [{ "id" => 52, "name" => expected_name, "project_id" => nil }],
        credential_status: "rejected"
      )
    )
  end

  def test_fails_closed_on_conflicting_duplicate_foreign_or_indeterminate_neon_account_credentials
    expected_name = "cataqui-backend-opentofu-bootstrap"
    _assert_error("conflicting Neon account API keys") do
      Bootstrap.decide_neon_account_credential(
        expected_name: expected_name,
        stored_by_environment: {
          "staging" => { "key" => SecureRandom.uuid, "id" => "61" },
          "production" => { "key" => SecureRandom.uuid, "id" => "61" }
        },
        inventory: [{ "id" => 61, "name" => expected_name }],
        credential_status: "accepted"
      )
    end
    input = {
      expected_name: expected_name,
      stored_by_environment: { "staging" => { "key" => SecureRandom.uuid, "id" => "61" }, "production" => {} },
      credential_status: "accepted"
    }
    _assert_error("Duplicate Neon bootstrap ownership") do
      Bootstrap.decide_neon_account_credential(
        **input,
        inventory: [
          { "id" => 61, "name" => expected_name, "project_id" => nil },
          { "id" => 62, "name" => expected_name, "project_id" => nil }
        ]
      )
    end
    _assert_error("Foreign Neon account API key metadata") do
      Bootstrap.decide_neon_account_credential(
        **input,
        inventory: [{ "id" => 61, "name" => "foreign-key", "project_id" => nil }]
      )
    end
    _assert_error("Unable to determine") do
      Bootstrap.decide_neon_account_credential(
        **input,
        credential_status: "indeterminate",
        inventory: [{ "id" => 61, "name" => expected_name, "project_id" => nil }]
      )
    end
    _assert_error("wrong account or organization role") do
      Bootstrap.decide_neon_account_credential(
        **input,
        credential_status: "foreign",
        inventory: [{ "id" => 61, "name" => expected_name, "project_id" => nil }]
      )
    end
  end

  def test_writes_a_newly_issued_shared_neon_account_key_before_its_reconciliation_id
    events = []
    generated_key = SecureRandom.uuid
    result = Bootstrap.reconcile_neon_account_credential(
      expected_name: "cataqui-backend-opentofu-bootstrap",
      stored_by_environment: { "staging" => {}, "production" => {} },
      inventory: [],
      verify_key: proc { "missing" },
      revoke_key: proc { events.push("revoke") },
      create_key: proc { { "id" => 71, "key" => generated_key } },
      write_key: proc { |environment, key| events.push("#{environment}:key:#{key == generated_key}") },
      write_key_id: proc { |environment, key_id| events.push("#{environment}:id:#{key_id}") }
    )
    assert_equal({ "action" => "create", "keyId" => "71" }, result)
    assert_equal ["staging:key:true", "staging:id:71", "production:key:true", "production:id:71"], events
  end

  def test_does_not_mutate_a_healthy_neon_account_key_and_revokes_an_invalid_key_before_replacement
    expected_name = "cataqui-backend-opentofu-bootstrap"
    events = []
    stored_key = SecureRandom.uuid
    result = Bootstrap.reconcile_neon_account_credential(
      expected_name: expected_name,
      stored_by_environment: {
        "staging" => { "key" => stored_key, "id" => "81" },
        "production" => { "key" => stored_key, "id" => "81" }
      },
      inventory: [{ "id" => 81, "name" => expected_name, "project_id" => nil }],
      verify_key: proc { "accepted" },
      revoke_key: proc { events.push("revoke") },
      create_key: proc { { "id" => 82, "key" => SecureRandom.uuid } },
      write_key: proc { events.push("key") },
      write_key_id: proc { events.push("id") }
    )
    assert_equal({ "action" => "reuse", "keyId" => "81", "missingEnvironments" => [] }, result)
    assert_equal [], events

    Bootstrap.reconcile_neon_account_credential(
      expected_name: expected_name,
      stored_by_environment: {
        "staging" => { "key" => stored_key, "id" => "81" },
        "production" => { "key" => stored_key, "id" => "81" }
      },
      inventory: [{ "id" => 81, "name" => expected_name, "project_id" => nil }],
      verify_key: proc { "rejected" },
      revoke_key: proc { |key_id| events.push("revoke:#{key_id}") },
      create_key: proc do
        events.push("create")
        { "id" => 82, "key" => SecureRandom.uuid }
      end,
      write_key: proc { |environment| events.push("#{environment}:key") },
      write_key_id: proc { |environment| events.push("#{environment}:id") }
    )
    assert_equal ["revoke:81", "create", "staging:key", "staging:id", "production:key", "production:id"], events
  end

  [
    [[], { "kind" => "missing" }, "create"],
    [[], { "kind" => "hidden-or-missing" }, "claim"],
    [[], { "kind" => "found", "project" => { "parent" => "organizations/945579294313" } }, "import"],
    [[], { "kind" => "found", "project" => { "parent" => { "id" => "945579294313", "type" => "organization" }, "lifecycleState" => "ACTIVE" } }, "import"],
    [["cataqui-staging-mre5wge"], { "kind" => "found", "project" => { "parent" => "organizations/945579294313" } }, "reconcile"]
  ].each_with_index do |(remote_state_project_ids, project_discovery, expected), index|
    define_method("test_chooses_the_google_project_create_import_or_reconciliation_path_#{index}") do
      assert_equal(
        expected,
        Bootstrap.decide_google_project(
          expected_project_id: "cataqui-staging-mre5wge",
          expected_organization_id: "945579294313",
          remote_state_project_ids: remote_state_project_ids.dup,
          project_discovery: project_discovery
        )
      )
    end
  end

  def test_recovers_only_a_verified_expected_google_project_left_tainted_by_partial_creation
    assert_equal(
      "recover",
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-staging-mre5wge",
        expected_organization_id: "945579294313",
        remote_state_project_ids: ["cataqui-staging-mre5wge"],
        tainted_project_ids: ["cataqui-staging-mre5wge"],
        project_discovery: { "kind" => "found", "project" => { "parent" => "organizations/945579294313" } }
      )
    )
    _assert_error("invalid tainted project instance") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-staging-mre5wge",
        expected_organization_id: "945579294313",
        remote_state_project_ids: [],
        tainted_project_ids: ["cataqui-staging-mre5wge"],
        project_discovery: { "kind" => "found", "project" => { "parent" => "organizations/945579294313" } }
      )
    end
  end

  def test_classifies_google_project_discovery_without_treating_provider_failures_as_absence
    assert_equal(
      { "kind" => "found", "project" => { "parent" => "organizations/945579294313" } },
      Bootstrap.classify_google_project_discovery(
        project_id: "cataqui-staging-mre5wge",
        status: 0,
        stdout: JSON.generate({ "parent" => "organizations/945579294313" }),
        stderr: ""
      )
    )
    assert_equal(
      { "kind" => "missing" },
      Bootstrap.classify_google_project_discovery(
        project_id: "cataqui-staging-mre5wge",
        status: 1,
        stdout: "",
        stderr: "NOT_FOUND: project does not exist"
      )
    )
    assert_equal(
      { "kind" => "hidden-or-missing" },
      Bootstrap.classify_google_project_discovery(
        project_id: "cataqui-staging-mre5wge",
        status: 1,
        stdout: "",
        stderr: "ryan@ventairy.com does not have permission to access projects instance [cataqui-staging-mre5wge] (or it may not exist): The caller does not have permission."
      )
    )
    _assert_error("invalid project metadata") do
      Bootstrap.classify_google_project_discovery(
        project_id: "cataqui-staging-mre5wge",
        status: 0,
        stdout: "not-json",
        stderr: ""
      )
    end
    _assert_error("Unable to determine ownership") do
      Bootstrap.classify_google_project_discovery(
        project_id: "cataqui-staging-mre5wge",
        status: 1,
        stdout: "",
        stderr: "UNAUTHENTICATED: login expired"
      )
    end
  end

  def test_rejects_foreign_projects_and_protected_legacy_state
    _assert_error("outside the declared organization") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-staging-mre5wge",
        expected_organization_id: "945579294313",
        remote_state_project_ids: [],
        project_discovery: { "kind" => "found", "project" => { "parent" => "organizations/111111111111" } }
      )
    end
    _assert_error("unexpected protected project") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-production-jd7bfto",
        expected_organization_id: "945579294313",
        remote_state_project_ids: ["cataqui"],
        project_discovery: { "kind" => "missing" }
      )
    end
    _assert_error("no longer exists") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-production-jd7bfto",
        expected_organization_id: "945579294313",
        remote_state_project_ids: ["cataqui-production-jd7bfto"],
        project_discovery: { "kind" => "missing" }
      )
    end
    _assert_error("not active") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-production-jd7bfto",
        expected_organization_id: "945579294313",
        remote_state_project_ids: [],
        project_discovery: {
          "kind" => "found",
          "project" => { "parent" => "organizations/945579294313", "lifecycleState" => "DELETE_REQUESTED" }
        }
      )
    end
    _assert_error("ownership cannot be verified") do
      Bootstrap.decide_google_project(
        expected_project_id: "cataqui-production-jd7bfto",
        expected_organization_id: "945579294313",
        remote_state_project_ids: ["cataqui-production-jd7bfto"],
        project_discovery: { "kind" => "hidden-or-missing" }
      )
    end
  end

  def test_redacts_every_known_secret_without_exposing_short_identifiers
    assert_equal(
      "token=[REDACTED] password=[REDACTED]",
      Bootstrap.redact_secrets(
        value: "token=very-secret-value password=another-secret",
        secrets: ["very-secret-value", "another-secret"]
      )
    )
    assert_equal "id=abc", Bootstrap.redact_secrets(value: "id=abc", secrets: ["abc"])
    assert_equal "42", Bootstrap.redact_secrets(value: 42, secrets: [nil])
  end

  def test_compares_credential_values_without_timing_sensitive_string_equality
    assert_equal true, Bootstrap.constant_time_equal(left: "same", right: "same")
    assert_equal false, Bootstrap.constant_time_equal(left: "same", right: "different")
    assert_equal false, Bootstrap.constant_time_equal(left: nil, right: "same")
  end

  [nil, "", 42].each_with_index do |value, index|
    define_method("test_rejects_an_invalid_requested_meta_secret_before_writing_#{index}") do
      writes = []
      _assert_error("The staging Meta app secret cannot be empty.") do
        Bootstrap.reconcile_meta_app_secret_state(
          stored_by_environment: { "staging" => nil, "production" => nil },
          request_secret: proc { value },
          write_secret: proc { |environment, secret| writes << [environment, secret] }
        )
      end
      assert_empty writes
    end
  end

  [nil, ""].each_with_index do |value, index|
    define_method("test_rejects_an_empty_supplied_upstash_key_before_verification_or_writing_#{index}") do
      events = []
      _assert_error("The supplied Upstash bootstrap API key is empty.") do
        Bootstrap.reconcile_upstash_credential(
          stored_by_environment: { "staging" => nil, "production" => nil },
          request_key: proc { value },
          verify_key: proc { events << "verify"; "accepted" },
          write_key: proc { events << "write" }
        )
      end
      assert_empty events
    end
  end

  [nil, {}, { "id" => 91 }, { "id" => 91, "key" => "" }].each_with_index do |credential, index|
    define_method("test_rejects_incomplete_created_neon_credentials_before_writing_#{index}") do
      events = []
      _assert_error("Neon did not return a complete account API key.") do
        Bootstrap.reconcile_neon_account_credential(
          expected_name: "cataqui-backend-opentofu-bootstrap",
          stored_by_environment: { "staging" => {}, "production" => {} }, inventory: [],
          verify_key: proc { raise "unexpected verification" },
          revoke_key: proc { raise "unexpected revocation" }, create_key: proc { credential },
          write_key: proc { events << "key" }, write_key_id: proc { events << "id" }
        )
      end
      assert_empty events
    end
  end

  def test_repairs_a_missing_neon_environment_with_the_verified_stored_key_without_rotation
    key = SecureRandom.uuid
    events = []
    result = Bootstrap.reconcile_neon_account_credential(
      expected_name: "cataqui-backend-opentofu-bootstrap",
      stored_by_environment: { "staging" => { "id" => "91", "key" => key }, "production" => {} },
      inventory: [{ "id" => 91, "name" => "cataqui-backend-opentofu-bootstrap" }],
      verify_key: proc { |value| assert_equal key, value; "accepted" },
      revoke_key: proc { raise "unexpected revocation" }, create_key: proc { raise "unexpected creation" },
      write_key: proc { |environment, value| events << [environment, "key", value] },
      write_key_id: proc { |environment, value| events << [environment, "id", value] }
    )
    assert_equal({ "action" => "repair", "keyId" => "91" }, result)
    assert_equal [["production", "key", key], ["production", "id", "91"]], events
  end

  %w[revoke create key id].each do |failure|
    define_method("test_stops_neon_credential_replacement_when_#{failure}_fails") do
      stored_key = SecureRandom.uuid
      generated_key = SecureRandom.uuid
      events = []
      operation = proc do |name|
        events << name
        raise "provider #{name} failed" if name == failure
      end
      _assert_error("provider #{failure} failed") do
        Bootstrap.reconcile_neon_account_credential(
          expected_name: "cataqui-backend-opentofu-bootstrap",
          stored_by_environment: {
            "staging" => { "id" => "91", "key" => stored_key },
            "production" => { "id" => "91", "key" => stored_key }
          },
          inventory: [{ "id" => 91, "name" => "cataqui-backend-opentofu-bootstrap" }],
          verify_key: proc { "rejected" }, revoke_key: proc { operation.call("revoke") },
          create_key: proc { operation.call("create"); { "id" => 92, "key" => generated_key } },
          write_key: proc { operation.call("key") }, write_key_id: proc { operation.call("id") }
        )
      end
      expected = %w[revoke create key id]
      assert_equal expected.take(expected.index(failure) + 1), events
    end
  end

  def test_rejects_conflicting_neon_key_ids_even_when_the_secret_matches
    key = SecureRandom.uuid
    _assert_error("conflicting Neon account API key IDs") do
      Bootstrap.decide_neon_account_credential(
        expected_name: "expected", stored_by_environment: {
          "staging" => { "key" => key, "id" => "91" }, "production" => { "key" => key, "id" => "92" }
        }, inventory: [{ "id" => 91, "name" => "expected" }], credential_status: "accepted"
      )
    end
  end

  def test_rejects_neon_inventory_that_assigns_the_expected_name_to_another_key
    _assert_error("metadata does not match") do
      Bootstrap.decide_neon_account_credential(
        expected_name: "expected", stored_by_environment: {
          "staging" => { "key" => SecureRandom.uuid, "id" => "91" }, "production" => {}
        }, inventory: [{ "id" => 92, "name" => "expected" }], credential_status: "accepted"
      )
    end
  end

  def test_refuses_an_accepted_neon_key_without_its_owned_inventory_entry
    _assert_error("Foreign Neon account credential conflicts") do
      Bootstrap.decide_neon_account_credential(
        expected_name: "expected", stored_by_environment: {
          "staging" => { "key" => SecureRandom.uuid, "id" => "91" }, "production" => {}
        }, inventory: [], credential_status: "accepted"
      )
    end
  end

  def test_reuses_an_existing_infisical_folder_and_verifies_a_new_folder_before_returning
    writes = []
    existing = [{ "id" => "existing", "name" => "manual" }]
    Bootstrap.reconcile_infisical_folder_state(
      name: "manual", list_folders: proc { existing }, create_folder: proc { writes << "unexpected" }
    )
    assert_empty writes

    reads = 0
    Bootstrap.reconcile_infisical_folder_state(
      name: "manual", list_folders: proc { reads += 1; reads == 1 ? [] : existing },
      create_folder: proc { writes << "create" }
    )
    assert_equal ["create"], writes
    assert_equal 2, reads
  end

  [nil, { "orgId" => "foreign-organization" }].each_with_index do |created, index|
    define_method("test_rejects_an_unverified_created_infisical_project_before_environment_writes_#{index}") do
      events = []
      _assert_error("unexpected organization") do
        Bootstrap.reconcile_infisical_project_state(
          **_expected_infisical_project,
          list_projects: proc { [_infisical_project.merge("slug" => "unrelated")] },
          create_project: proc { created }, update_project: proc { raise "unexpected update" },
          create_environment: proc { events << "environment" }
        )
      end
      assert_empty events
    end
  end

  def test_stops_when_the_created_infisical_project_disappears_before_environment_creation
    reads = 0
    events = []
    _assert_error("disappeared during reconciliation") do
      Bootstrap.reconcile_infisical_project_state(
        **_expected_infisical_project,
        list_projects: proc { reads += 1; [_infisical_project.merge("slug" => "unrelated")] },
        create_project: proc { _infisical_project }, update_project: proc { raise "unexpected update" },
        create_environment: proc { events << "environment" }
      )
    end
    assert_equal 2, reads
    assert_empty events
  end

  def test_rejects_a_healthy_infisical_project_that_disappears_during_final_verification
    reads = 0
    project = _infisical_project.merge("environments" => [{ "slug" => "staging" }, { "slug" => "production" }])
    _assert_error("disappeared during reconciliation") do
      Bootstrap.reconcile_infisical_project_state(
        **_expected_infisical_project, list_projects: proc { reads += 1; reads == 1 ? [project] : [] },
        create_project: proc { raise "unexpected create" }, update_project: proc { raise "unexpected update" },
        create_environment: proc { raise "unexpected environment creation" }
      )
    end
  end

  def test_does_not_report_success_when_infisical_environment_creation_is_not_visible_on_readback
    project = _infisical_project.merge("environments" => [{ "slug" => "staging" }])
    events = []
    _assert_error("failed final verification") do
      Bootstrap.reconcile_infisical_project_state(
        **_expected_infisical_project, list_projects: proc { [project] },
        create_project: proc { raise "unexpected create" }, update_project: proc { raise "unexpected update" },
        create_environment: proc { |input| events << input.fetch("environment") }
      )
    end
    assert_equal ["production"], events
  end

  def test_treats_an_absent_infisical_environment_inventory_as_incomplete
    assert_equal %w[staging production], Bootstrap.get_missing_infisical_environments(project: {})
  end

  private

  def _assert_error(message = nil, &block)
    error = assert_raises(StandardError, &block)
    assert_includes error.message, message if message
    error
  end

  def _expected_infisical_project
    {
      expected_organization_id: @platforms.dig("infisical", "organization_id"),
      expected_name: @platforms.dig("infisical", "project", "name"),
      expected_slug: @platforms.dig("infisical", "project", "slug")
    }
  end

  def _infisical_project
    {
      "id" => "project-id", "orgId" => @platforms.dig("infisical", "organization_id"),
      "name" => @platforms.dig("infisical", "project", "name"),
      "slug" => @platforms.dig("infisical", "project", "slug"),
      "type" => "secret-manager", "hasDeleteProtection" => true, "environments" => []
    }
  end
end
