# frozen_string_literal: true

require_relative "test_helper"
require "json"
require "uri"
require_relative "../infisical-bootstrap"

class InfrastructureInfisicalBootstrapTest < Minitest::Test
  Response = Struct.new(:code, :body)

  def setup
    @manifest = JSON.parse(File.read(File.expand_path("../../manifest.json", __dir__), encoding: Encoding::UTF_8))
    @input = {
      manifest: @manifest,
      project_id: "project-id",
      infisical_token: "fixture-session-token",
      environment: "staging",
      github_oidc_subject_prefix: "repo:Cataqui@288484515/backend@1252587238"
    }
    @secret_input = {
      project_id: @input[:project_id], token: @input[:infisical_token], environment: "staging",
      secret_path: "/opentofu/bootstrap", name: "R2_STATE_ACCESS_KEY_ID"
    }
    @calls = []
    Bootstrap::KNOWN_SECRETS.clear
  end

  def _response(payload = {}, status: 200)
    Response.new(status.to_s, JSON.generate(payload))
  end

  def _with_boundaries(request: nil, http: nil, run: nil)
    replacements = {
      request_json: request || ->(*) { raise "Unexpected Infisical request_json call" },
      http_request: http || ->(*) { raise "Unexpected Infisical http_request call" },
      run_async: run || ->(*) { raise "Unexpected Infisical run_async call" }
    }
    originals = replacements.keys.to_h { |name| [name, Bootstrap.method(name)] }
    replacements.each do |name, implementation|
      Bootstrap.define_singleton_method(name) { |*args, **options| implementation.call(*args, **options) }
    end
    yield
  ensure
    originals&.each { |name, implementation| Bootstrap.define_singleton_method(name, implementation) }
  end

  def _identity_boundaries(fault: nil, healthy_trust: false, foreign: false, status: 200, scenario: nil)
    oidc = {
      "oidcDiscoveryUrl" => "https://token.actions.githubusercontent.com",
      "boundIssuer" => "https://token.actions.githubusercontent.com",
      "boundAudiences" => "https://github.com/Cataqui",
      "boundSubject" => "#{@input[:github_oidc_subject_prefix]}:environment:staging",
      "boundClaims" => {},
      "accessTokenTrustedIps" => [
        { "ipAddress" => "0.0.0.0", "type" => "ipv4", "prefix" => 0 },
        { "ipAddress" => "::", "type" => "ipv6", "prefix" => 0 }
      ],
      "accessTokenTTL" => 3600, "accessTokenMaxTTL" => 3600, "accessTokenNumUsesLimit" => 0
    }
    desired_privilege = {}
    membership_reads = 0
    privilege_reads = 0
    identity_reads = 0
    identity_present = !["identity-create", "identity-limit"].include?(scenario)
    identity_protected = scenario != "identity-unprotected"
    http = lambda do |_url, **_options|
      next Response.new("503", "invalid-json") if scenario == "malformed-oidc"
      next _response(status: 404) if scenario == "missing-oidc"

      inspected_oidc = healthy_trust ? oidc : {
        "boundSubject" => foreign ? "repo:foreign" : oidc["boundSubject"],
        "boundIssuer" => "https://token.actions.githubusercontent.com"
      }
      _response({ "identityOidcAuth" => inspected_oidc }, status: status)
    end
    request = lambda do |url, **options|
      @calls.push([url, options])
      if url.include?("/identities?")
        identity_reads += 1
        next {} if fault == "identity-inventory"
        next {} if scenario == "identity-inventory-unavailable-on-verify" && identity_reads > 1
        next { "identities" => [] } unless identity_present
        next { "identities" => [] } if scenario == "identity-absent-on-verify" && identity_reads > 1

        next {
          "identities" => [{
            "id" => "identity-id",
            "name" => @manifest.fetch("infisical").fetch("opentofu_identities").fetch("cataqui_backend_staging"),
            "hasDeleteProtection" => identity_protected,
            "metadata" => [{ "key" => "owner", "value" => "Cataqui" }]
          }]
        }
      end
      if url.end_with?("/projects/project-id/identities") && options[:method] == "POST"
        raise "identity limit reached" if scenario == "identity-limit"

        identity_present = true
        next { "identity" => { "id" => "identity-id", "hasDeleteProtection" => true } }
      end
      if url.end_with?("/projects/project-id/identities/identity-id") && options[:method] == "PATCH"
        identity_protected = true
        next {}
      end
      if url.include?("/memberships/identities/")
        membership_reads += 1
        next { "identityMembership" => nil } if scenario == "membership-absent-on-verify" && membership_reads > 1

        next {
          "identityMembership" => {
            "roles" => [{
              "role" => (fault == "membership" && membership_reads > 1) || (scenario == "membership-drift" && membership_reads == 1) ? "admin" : "no-access",
              "isTemporary" => false
            }]
          }
        }
      end
      if url.include?("/additional-privilege/identity?")
        privilege_reads += 1
        next {} if fault == "privilege-inventory"
        next { "privileges" => [] } if scenario&.start_with?("privilege-") && privilege_reads == 1
        next {} if scenario == "privilege-race-invalid"
        next { "privileges" => [] } if scenario == "privilege-race-disappeared"
        next {} if scenario == "verified-privileges-unavailable" && privilege_reads > 1

        permission_fixture = fault == "privilege" || privilege_reads == 1 ? [] : desired_privilege["permissions"]
        if scenario == "inverted-permission" && privilege_reads == 1
          permission_fixture = [{ "subject" => "secrets", "action" => "readValue", "inverted" => true }]
        end

        next {
          "privileges" => [{
            "id" => "privilege-id", "slug" => scenario == "foreign-privilege" ? "foreign" : "opentofu-staging", "isTemporary" => false,
            "permissions" => permission_fixture || []
          }]
        }
      end
      if url.end_with?("/identity-project-additional-privilege") && options[:method] == "POST"
        raise "fixture server failure" if scenario == "privilege-server-failure"
        if ["privilege-already-present", "privilege-race-invalid", "privilege-race-disappeared"].include?(scenario)
          raise "Additional privilege with name opentofu-staging exists"
        end

        desired_privilege = options[:body] || {}
        next {}
      end
      if url.include?("/identity-project-additional-privilege/") && options[:method] == "PATCH"
        desired_privilege = options[:body] || {}
        next {}
      end
      if url.include?("/oidc-auth/identities/")
        if ["POST", "PATCH"].include?(options[:method])
          oidc = options[:body] || {}
          next {}
        end
        next { "identityOidcAuth" => nil } if scenario == "oidc-absent-on-verify"

        next { "identityOidcAuth" => oidc.merge(fault == "oidc" ? { "accessTokenTTL" => 86400 } : {}) }
      end
      raise "Unexpected Infisical fixture request: #{options[:method] || "GET"} #{URI(url).path}"
    end
    { request: request, http: http }
  end

  def test_verifies_the_complete_owned_identity_contract_after_repairing_mutable_drift
    _with_boundaries(**_identity_boundaries) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
    end
  end

  def test_creates_a_missing_environment_identity_and_verifies_it_before_returning
    _with_boundaries(**_identity_boundaries(scenario: "identity-create")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      creation = @calls.find { |url, options| url.end_with?("/projects/project-id/identities") && options[:method] == "POST" }
      assert_equal({
        "name" => @manifest["infisical"]["opentofu_identities"]["cataqui_backend_staging"],
        "hasDeleteProtection" => true, "metadata" => []
      }, creation[1][:body])
    end
  end

  def test_enables_identity_delete_protection_while_preserving_user_metadata
    _with_boundaries(**_identity_boundaries(scenario: "identity-unprotected")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      update = @calls.find { |url, options| url.end_with?("/projects/project-id/identities/identity-id") && options[:method] == "PATCH" }
      assert_equal [{ "key" => "owner", "value" => "Cataqui" }], update[1][:body]["metadata"]
      assert_equal true, update[1][:body]["hasDeleteProtection"]
    end
  end

  def test_repairs_an_existing_admin_membership_to_the_owned_no_access_role
    _with_boundaries(**_identity_boundaries(scenario: "membership-drift")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      update = @calls.find { |url, options| url.include?("/memberships/") && options[:method] == "PATCH" }
      assert_equal [{ "role" => "no-access", "isTemporary" => false }], update[1][:body]["roles"]
    end
  end

  def test_creates_oidc_trust_only_after_the_provider_conclusively_reports_it_missing
    _with_boundaries(**_identity_boundaries(scenario: "missing-oidc")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      writes = @calls.select { |url, options| url.include?("/oidc-auth/") && options[:method] }
      assert_equal(["POST"], writes.map { |_, options| options[:method] })
      assert_equal "#{@input[:github_oidc_subject_prefix]}:environment:staging", writes[0][1][:body]["boundSubject"]
    end
  end

  def test_creates_missing_privileges_scoped_to_the_owned_environment
    _with_boundaries(**_identity_boundaries(scenario: "privilege-create")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      creation = @calls.find { |url, options| url.end_with?("/identity-project-additional-privilege") && options[:method] == "POST" }
      assert_equal "opentofu-staging", creation[1][:body]["slug"]
      assert_equal({ "isTemporary" => false }, creation[1][:body]["type"])
      assert(creation[1][:body]["permissions"].all? { |permission| permission["conditions"]["environment"] == { "$eq" => "staging" } })
      refute(@calls.any? { |url, options| url.include?("/identity-project-additional-privilege/") && options[:method] == "PATCH" })
    end
  end

  def test_adopts_a_privilege_created_concurrently_only_after_refreshing_and_reconciling_it
    _with_boundaries(**_identity_boundaries(scenario: "privilege-already-present")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      assert_equal(3, @calls.count { |url, _| url.include?("/additional-privilege/identity?") })
      assert(@calls.any? { |url, options| url.include?("/identity-project-additional-privilege/") && options[:method] == "PATCH" })
    end
  end

  def test_repairs_inverted_scalar_permission_drift_and_verifies_the_owned_permission_set
    _with_boundaries(**_identity_boundaries(scenario: "inverted-permission")) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      update = @calls.find { |url, options| url.include?("/identity-project-additional-privilege/") && options[:method] == "PATCH" }
      refute(update[1][:body]["permissions"].any? { |permission| permission["inverted"] })
    end
  end

  {
    "identity-limit" => "Infisical identity capacity is exhausted",
    "foreign-privilege" => "privileges not owned by bootstrap",
    "malformed-oidc" => "Unable to inspect Infisical OIDC trust for staging (503)",
    "privilege-server-failure" => "fixture server failure",
    "privilege-race-invalid" => "invalid privilege inventory",
    "privilege-race-disappeared" => "Additional privilege with name opentofu-staging exists",
    "oidc-absent-on-verify" => "Infisical OIDC verification failed",
    "verified-privileges-unavailable" => "Infisical privilege verification failed",
    "membership-absent-on-verify" => "Infisical membership verification failed",
    "identity-inventory-unavailable-on-verify" => "invalid identity inventory",
    "identity-absent-on-verify" => "Infisical identity verification failed"
  }.each do |scenario, message|
    define_method("test_rejects_#{scenario.tr("-", "_")}_instead_of_reporting_verified_identity") do
      _with_boundaries(**_identity_boundaries(scenario: scenario)) do
        error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
        assert_includes error.message, message
      end
    end
  end

  def test_rejects_a_malformed_project_inventory_before_attempting_project_creation
    request = lambda do |_url, **options|
      refute options[:method]
      {}
    end
    _with_boundaries do
      error = assert_raises(RuntimeError) do
        Bootstrap.reconcile_infisical_project(
          { "platforms" => { "infisical" => { "organization_id" => "fixture-org" } }, "manifest" => @manifest },
          @input[:infisical_token], request: request
        )
      end
      assert_includes error.message, "invalid project inventory"
    end
  end

  ["identity-inventory", "privilege-inventory"].each do |fault|
    define_method("test_rejects_unavailable_#{fault.tr("-", "_")}_before_creating_resources") do
      _with_boundaries(**_identity_boundaries(fault: fault)) do
        error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
        assert_includes error.message, "invalid"
        refute(@calls.any? { |_, options| options[:method] == "POST" })
      end
    end
  end

  { "privilege" => "privilege", "membership" => "membership", "oidc" => "OIDC" }.each do |fault, subject|
    define_method("test_rejects_provider_retained_#{fault}_drift_instead_of_reporting_verified_identity") do
      _with_boundaries(**_identity_boundaries(fault: fault)) do
        error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
        assert_includes error.message, "Infisical #{subject} verification failed"
      end
    end
  end

  def test_reuses_provider_normalized_cidr_trust_without_rewriting_healthy_oidc_configuration
    _with_boundaries(**_identity_boundaries(healthy_trust: true)) do
      assert_equal "identity-id", Bootstrap.reconcile_infisical_identity(**@input)
      refute(@calls.any? { |url, options| url.include?("/oidc-auth/") && options[:method] == "PATCH" })
    end
  end

  def test_rejects_foreign_oidc_ownership_before_reconciling_identity_permissions
    _with_boundaries(**_identity_boundaries(foreign: true)) do
      error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
      assert_includes error.message, "Foreign Infisical OIDC trust"
      refute(@calls.any? { |_, options| options[:method] == "PATCH" })
    end
  end

  def test_foreign_unprotected_identity_is_rejected_without_enabling_delete_protection
    _with_boundaries(**_identity_boundaries(foreign: true, scenario: "identity-unprotected")) do
      error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
      assert_includes error.message, "Foreign Infisical OIDC trust"
      refute(@calls.any? { |_, options| ["POST", "PATCH", "DELETE"].include?(options[:method]) })
    end
  end

  [403, 503].each do |status|
    define_method("test_does_not_replace_oidc_trust_after_indeterminate_provider_response_#{status}") do
      _with_boundaries(**_identity_boundaries(status: status)) do
        error = assert_raises(RuntimeError) { Bootstrap.reconcile_infisical_identity(**@input) }
        assert_includes error.message, "Unable to inspect Infisical OIDC trust for staging (#{status})"
        refute(@calls.any? { |_, options| ["POST", "PATCH"].include?(options[:method]) })
      end
    end
  end

  def test_reads_only_the_exact_shared_secret_and_registers_acquired_values_for_redaction
    http = lambda do |url, **options|
      @calls.push([url, options])
      _response({ "secret" => { "secretValue" => "fixture-secret-value" } })
    end
    _with_boundaries(http: http) do
      assert_equal "fixture-secret-value", Bootstrap.get_infisical_secret(**@secret_input)
      assert_includes Bootstrap::KNOWN_SECRETS, "fixture-secret-value"
      url = URI(@calls[0][0])
      assert_equal "/api/v4/secrets/R2_STATE_ACCESS_KEY_ID", url.path
      assert_equal(
        {
          "projectId" => @input[:project_id], "environment" => "staging", "secretPath" => "/opentofu/bootstrap",
          "type" => "shared", "viewSecretValue" => "true", "expandSecretReferences" => "false"
        }, URI.decode_www_form(url.query).to_h
      )
    end
  end

  def test_treats_only_a_missing_secret_as_absent_and_propagates_inspection_failures
    _with_boundaries(http: ->(*, **) { _response(status: 404) }) do
      assert_nil Bootstrap.get_bootstrap_secret(**@secret_input.reject { |key, _| key == :secret_path })
    end
    _with_boundaries(http: ->(*, **) { _response(status: 503) }) do
      assert_includes assert_raises(RuntimeError) { Bootstrap.get_infisical_secret(**@secret_input) }.message, "503"
    end
    _with_boundaries(http: ->(*, **) { raise "fixture network failure" }) do
      assert_equal "fixture network failure", assert_raises(RuntimeError) { Bootstrap.get_infisical_secret(**@secret_input) }.message
    end
  end

  def test_rejects_malformed_secret_responses_before_overwriting_an_unverified_value
    _with_boundaries(http: ->(*, **) { _response({ "secret" => {} }) }) do
      error = assert_raises(RuntimeError) { Bootstrap.set_infisical_secret(**@secret_input, value: "replacement-fixture") }
      assert_includes error.message, "invalid secret response"
    end
  end

  def test_updates_an_existing_empty_secret_instead_of_attempting_duplicate_creation
    request = ->(url, **options) { @calls.push([url, options]); {} }
    _with_boundaries(http: ->(*, **) { _response({ "secret" => { "secretValue" => "" } }) }, request: request) do
      Bootstrap.set_infisical_secret(**@secret_input, value: "replacement-fixture")
      assert_equal "PATCH", @calls[0][1][:method]
    end
  end

  def test_deletes_an_existing_empty_secret_instead_of_treating_it_as_absent
    request = ->(url, **options) { @calls.push([url, options]); {} }
    _with_boundaries(http: ->(*, **) { _response({ "secret" => { "secretValue" => "" } }) }, request: request) do
      Bootstrap.delete_infisical_secret(**@secret_input)
      assert_equal "DELETE", @calls[0][1][:method]
    end
  end

  def test_reuses_an_equal_secret_without_writes_and_updates_only_a_changed_value
    request = ->(url, **options) { @calls.push([url, options]); {} }
    _with_boundaries(http: ->(*, **) { _response({ "secret" => { "secretValue" => "existing-fixture" } }) }, request: request) do
      Bootstrap.set_infisical_secret(**@secret_input, value: "existing-fixture")
      assert_empty @calls
      Bootstrap.set_bootstrap_secret(**@secret_input.reject { |key, _| key == :secret_path }, value: "replacement-fixture")
      assert_includes @calls[0][0], "/api/v4/secrets/R2_STATE_ACCESS_KEY_ID"
      assert_equal "PATCH", @calls[0][1][:method]
      assert_equal "/opentofu/bootstrap", @calls[0][1][:body]["secretPath"]
      assert_equal "replacement-fixture", @calls[0][1][:body]["secretValue"]
      assert_equal "shared", @calls[0][1][:body]["type"]
    end
  end

  def test_creates_a_missing_secret_and_propagates_storage_rejection
    request = ->(url, **options) { @calls.push([url, options]); {} }
    _with_boundaries(http: ->(*, **) { _response(status: 404) }, request: request) do
      Bootstrap.set_bootstrap_secret(**@secret_input.reject { |key, _| key == :secret_path }, value: "new-fixture")
      assert_equal "POST", @calls[0][1][:method]
      assert_equal [200, 201], @calls[0][1][:accepted_statuses]
    end
    _with_boundaries(http: ->(*, **) { _response(status: 404) }, request: ->(*, **) { raise "fixture write rejected" }) do
      error = assert_raises(RuntimeError) { Bootstrap.set_infisical_secret(**@secret_input, value: "new-fixture") }
      assert_equal "fixture write rejected", error.message
    end
  end

  def test_deletes_only_a_present_bootstrap_secret_and_leaves_missing_values_untouched
    _with_boundaries(http: ->(*, **) { _response(status: 404) }) do
      Bootstrap.delete_bootstrap_secret(**@secret_input.reject { |key, _| key == :secret_path })
    end
    request = ->(url, **options) { @calls.push([url, options]); {} }
    _with_boundaries(http: ->(*, **) { _response({ "secret" => { "secretValue" => "existing-fixture" } }) }, request: request) do
      Bootstrap.delete_infisical_secret(**@secret_input)
      assert_equal "DELETE", @calls[0][1][:method]
      assert_equal(
        { "projectId" => @input[:project_id], "environment" => "staging", "secretPath" => "/opentofu/bootstrap", "type" => "shared" },
        @calls[0][1][:body]
      )
    end
  end

  def test_creates_and_verifies_each_missing_bootstrap_folder_in_its_environment
    folders = {}
    request = lambda do |url, **options|
      @calls.push([url, options])
      if options[:method] == "POST"
        body = options[:body]
        folders["#{body["environment"]}:#{body["path"]}"] = [{ "name" => body["name"] }]
        next {}
      end
      query = URI.decode_www_form(URI(url).query).to_h
      { "folders" => folders["#{query["environment"]}:#{query["path"]}"] || [] }
    end
    _with_boundaries(request: request) do
      Bootstrap.ensure_bootstrap_folders(@input[:project_id], @input[:infisical_token])
      assert_equal ["staging:/", "staging:/opentofu", "production:/", "production:/opentofu"], folders.keys
      @calls.clear
      Bootstrap.ensure_bootstrap_folders(@input[:project_id], @input[:infisical_token])
      refute(@calls.any? { |_, options| options[:method] == "POST" })
    end
  end

  def test_uses_isolated_backend_credentials_and_applies_the_saved_folder_plan_in_each_environment
    http = lambda do |url, **_options|
      _response({ "secret" => { "secretValue" => URI(url).path.end_with?("ACCESS_KEY_ID") ? "fixture-access" : "fixture-secret" } })
    end
    run = ->(command, args, **options) { @calls.push([command, args, options]); { "status" => 0, "stdout" => "", "stderr" => "" } }
    _with_boundaries(http: http, run: run) do
      Bootstrap.apply_generated_folders(@input[:project_id], @input[:infisical_token])
      assert_equal(["init", "plan", "apply", "init", "plan", "apply"], @calls.map { |_, args, _| args[0] })
      @calls.each do |command, args, options|
        assert_equal "tofu", command
        assert_equal "fixture-access", options[:env]["AWS_ACCESS_KEY_ID"]
        assert_equal "fixture-secret", options[:env]["AWS_SECRET_ACCESS_KEY"]
        assert_equal @input[:infisical_token], options[:env]["INFISICAL_TOKEN"]
        refute options[:env].key?("INFISICAL_AUTH_JWT")
        assert_match(/\.tfplan$/, args.last) if args[0] == "apply"
      end
    end
  end

  def test_removes_the_temporary_saved_plan_after_apply_failure
    http = ->(*, **) { _response({ "secret" => { "secretValue" => "fixture-backend-value" } }) }
    plan_path = nil
    run = lambda do |_command, args, **_options|
      if args[0] == "plan"
        plan_path = args.last
        File.write(plan_path, "fixture plan")
      elsif args[0] == "apply"
        raise "fixture apply failure"
      end
    end
    _with_boundaries(http: http, run: run) do
      error = assert_raises(RuntimeError) { Bootstrap.apply_generated_folders(@input[:project_id], @input[:infisical_token]) }
      assert_equal "fixture apply failure", error.message
      refute File.exist?(plan_path)
    end
  end

  def test_surfaces_permission_denied_when_the_sensitive_saved_plan_cannot_be_deleted
    http = ->(*, **) { _response({ "secret" => { "secretValue" => "fixture-backend-value" } }) }
    plan_path = nil
    run = lambda do |_command, args, **_options|
      next unless args[0] == "plan"

      plan_path = args.last
      File.write(plan_path, "fixture plan")
    end
    original_unlink = File.method(:unlink)
    File.define_singleton_method(:unlink) do |path|
      raise Errno::EACCES, path if path == plan_path

      original_unlink.call(path)
    end
    _with_boundaries(http: http, run: run) do
      error = assert_raises(Errno::EACCES) do
        Bootstrap.apply_generated_folders(@input[:project_id], @input[:infisical_token])
      end
      assert_includes error.message, plan_path
      assert File.file?(plan_path)
    end
  ensure
    File.define_singleton_method(:unlink, original_unlink) if original_unlink
    original_unlink.call(plan_path) if plan_path
  end

  def test_does_not_initialize_a_folder_backend_when_credentials_are_missing
    _with_boundaries(http: ->(*, **) { _response(status: 404) }) do
      error = assert_raises(RuntimeError) { Bootstrap.apply_generated_folders(@input[:project_id], @input[:infisical_token]) }
      assert_includes error.message, "Missing staging R2 backend credentials"
    end
  end

  ["create", "reconcile"].each do |operation|
    define_method("test_executes_the_public_project_#{operation}_boundary_and_verifies_environments") do
      organization_id = "33687647-d8e9-44a7-9cb9-721bd5b28a45"
      present = operation == "reconcile"
      project = {
        "id" => "fixture-project",
        "name" => operation == "reconcile" ? "drifted" : @manifest["infisical"]["project"]["name"],
        "slug" => @manifest["infisical"]["project"]["slug"],
        "orgId" => organization_id, "type" => "secret-manager",
        "hasDeleteProtection" => operation != "reconcile", "environments" => []
      }
      request = lambda do |url, **options|
        if options[:method] == "POST" && url.end_with?("/environments")
          project["environments"].push({ "slug" => options[:body]["slug"] })
          next {}
        end
        if ["POST", "PATCH"].include?(options[:method])
          present = true
          project["name"] = @manifest["infisical"]["project"]["name"]
          project["hasDeleteProtection"] = true
          next { "project" => project }
        end
        { "projects" => [project.merge("slug" => "other-owned-project"), *(present ? [project] : [])] }
      end
      _with_boundaries do
        assert_equal project["id"], Bootstrap.reconcile_infisical_project(
          { "platforms" => { "infisical" => { "organization_id" => organization_id } }, "manifest" => @manifest },
          @input[:infisical_token], request: request
        )
        assert_equal [{ "slug" => "staging" }, { "slug" => "production" }], project["environments"]
      end
    end
  end
end
