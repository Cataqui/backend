# frozen_string_literal: true

require_relative "test_helper"
require "json"
require_relative "../neon-bootstrap"
require_relative "../upstash-bootstrap"
require_relative "../meta-bootstrap"

class InfrastructureCredentialProvidersTest < Minitest::Test
  Response = Struct.new(:code, :body)

  def setup
    Bootstrap::KNOWN_SECRETS.clear
    @platforms = {
      "neon" => { "organization_id" => "fixture-organization/id" },
      "upstash" => { "account_email" => "fixture@example.test" }
    }
    @manifest = { "neon" => { "api_keys" => { "account_bootstrap" => { "name" => "owned-fixture-key" } } } }
    @requests = []
    @writes = []
    @prompts = []
    @logs = []
  end

  def teardown
    Bootstrap::KNOWN_SECRETS.clear
  end

  {
    "nested_account_owner" => ["accepted", [[200, { "id" => "owner" }], [200, nil], [200, { "members" => [{ "member" => { "user_id" => "owner", "role" => "admin" } }] }]]],
    "flat_account_owner" => ["accepted", [[200, { "user" => { "id" => "owner" } }], [200, nil], [200, { "members" => [{ "user_id" => "owner", "role" => "admin" }] }]]],
    "rejected_user_credential" => ["rejected", [[401, nil]]],
    "forbidden_user_inspection" => ["indeterminate", [[403, nil]]],
    "unavailable_user_inspection" => ["indeterminate", [IOError.new("Fixture provider unavailable")]],
    "malformed_user_json" => ["indeterminate", [Response.new("200", "{")]],
    "invalid_user_shape" => ["indeterminate", [[200, []]]],
    "missing_user_identity" => ["indeterminate", [[200, { "id" => "" }]]],
    "rejected_account_key_inventory" => ["rejected", [[200, { "id" => "owner" }], [401, nil]]],
    "foreign_account_key_scope" => ["foreign", [[200, { "id" => "owner" }], [403, nil]]],
    "rate_limited_account_key_inventory" => ["indeterminate", [[200, { "id" => "owner" }], [429, nil]]],
    "unavailable_account_key_inventory" => ["indeterminate", [[200, { "id" => "owner" }], IOError.new("Fixture provider unavailable")]],
    "rejected_organization_membership" => ["rejected", [[200, { "id" => "owner" }], [200, nil], [401, nil]]],
    "forbidden_organization_membership" => ["foreign", [[200, { "id" => "owner" }], [200, nil], [403, nil]]],
    "missing_organization_membership" => ["foreign", [[200, { "id" => "owner" }], [200, nil], [404, nil]]],
    "failed_organization_inspection" => ["indeterminate", [[200, { "id" => "owner" }], [200, nil], [500, nil]]],
    "unavailable_organization_inspection" => ["indeterminate", [[200, { "id" => "owner" }], [200, nil], IOError.new("Fixture provider unavailable")]],
    "non_admin_organization_role" => ["foreign", [[200, { "id" => "owner" }], [200, nil], [200, { "members" => [{ "user_id" => "owner", "role" => "member" }] }]]],
    "absent_account_membership" => ["foreign", [[200, { "id" => "owner" }], [200, nil], [200, { "members" => [nil, { "user_id" => "other-owner", "role" => "admin" }] }]]],
    "invalid_membership_shape" => ["indeterminate", [[200, { "id" => "owner" }], [200, nil], [200, { "members" => nil }]]]
  }.each do |scenario, (expected, responses)|
    define_method("test_neon_credential_verification_handles_#{scenario}") do
      _with_http_responses(responses) do
        assert_equal expected, Bootstrap._neon_verify_account_api_key(platforms: @platforms, key: "fixture-neon-key")
      end
      assert_includes Bootstrap::KNOWN_SECRETS, "fixture-neon-key"
      assert_equal "Bearer fixture-neon-key", @requests.first.fetch(:headers).fetch("authorization")
      if @requests.length == 3
        assert_includes @requests.last.fetch(:url), "/organizations/fixture-organization%2Fid/members?limit=500"
      end
    end
  end

  {
    "accepted_array" => [200, [], "accepted"],
    "invalid_object" => [200, {}, "indeterminate"],
    "unauthorized_key" => [401, {}, "rejected"],
    "forbidden_key" => [403, {}, "rejected"],
    "rate_limit" => [429, {}, "indeterminate"],
    "server_failure" => [500, {}, "indeterminate"]
  }.each do |scenario, (status, body, expected)|
    define_method("test_upstash_credential_verification_handles_#{scenario}") do
      _with_http_responses([[status, body]]) do
        assert_equal expected, Bootstrap._upstash_verify_api_key(platforms: @platforms, api_key: "fixture-upstash-key")
      end
      encoded = ["fixture@example.test:fixture-upstash-key"].pack("m0")
      assert_equal "Basic #{encoded}", @requests.first.fetch(:headers).fetch("authorization")
      assert_includes Bootstrap::KNOWN_SECRETS, "fixture-upstash-key"
      assert_includes Bootstrap::KNOWN_SECRETS, encoded
    end
  end

  def test_upstash_transport_failure_does_not_reject_a_potentially_valid_credential
    _with_http_responses([IOError.new("Fixture provider unavailable")]) do
      assert_equal "indeterminate", Bootstrap._upstash_verify_api_key(platforms: @platforms, api_key: "fixture-upstash-key")
    end
  end

  def test_upstash_malformed_json_does_not_prove_credential_rejection
    _with_http_responses([Response.new("200", "{")]) do
      assert_equal "indeterminate", Bootstrap._upstash_verify_api_key(platforms: @platforms, api_key: "fixture-upstash-key")
    end
  end

  def test_neon_cli_uses_only_the_default_oauth_profile_and_excludes_inherited_credentials
    previous_key = ENV["NEON_API_KEY"]
    previous_profile = ENV["NEON_PROFILE"]
    ENV["NEON_API_KEY"] = "fixture-inherited-key"
    ENV["NEON_PROFILE"] = "fixture-inherited-profile"
    commands = []
    _with_bootstrap_methods(run_async: lambda do |command, args, **options|
      commands << [command, args, options]
      { "stdout" => JSON.generate(args.first == "profile" ? [{ "name" => "DEFAULT", "auth" => "oauth" }] : []) }
    end) do
      Bootstrap.verify_neon_cli_authentication_async
    end
    assert_equal 2, commands.length
    commands.each do |command, args, options|
      assert_equal "neon", command
      refute options.fetch(:env).key?("NEON_API_KEY")
      refute options.fetch(:env).key?("NEON_PROFILE")
      assert_includes args, "--no-analytics"
    end
    assert_equal ["api-keys", "list", "--profile", "DEFAULT", "--output", "json", "--no-analytics"], commands.last[1]
  ensure
    ENV["NEON_API_KEY"] = previous_key
    ENV["NEON_PROFILE"] = previous_profile
  end

  [
    {}, [], [{ "name" => "DEFAULT", "auth" => "api_key" }],
    [{ "name" => "DEFAULT", "auth" => "oauth" }, { "name" => "DEFAULT", "auth" => "oauth" }]
  ].each_with_index do |profiles, index|
    define_method("test_neon_cli_rejects_untrusted_profile_inventory_#{index}") do
      calls = 0
      _with_bootstrap_methods(run_async: lambda do |*_args, **_options|
        calls += 1
        { "stdout" => JSON.generate(profiles) }
      end) do
        assert_raises(RuntimeError) { Bootstrap.verify_neon_cli_authentication_async }
      end
      assert_equal 1, calls
    end
  end

  def test_neon_cli_rejects_malformed_json_with_a_scoped_diagnostic
    _with_bootstrap_methods(run_async: ->(*_args, **_options) { { "stdout" => "{" } }) do
      error = assert_raises(RuntimeError) { Bootstrap.verify_neon_cli_authentication_async }
      assert_equal "Neon CLI returned invalid JSON while attempting to inspect the authenticated profile.", error.message
    end
  end

  [
    {}, [nil], [{ "id" => -1, "name" => "expected" }], [{ "id" => 1.5, "name" => "expected" }],
    [{ "id" => 9_007_199_254_740_992, "name" => "expected" }],
    [{ "id" => 1, "name" => "expected", "project_id" => 123 }], [{ "id" => 1, "name" => nil }]
  ].each_with_index do |inventory, index|
    define_method("test_neon_cli_rejects_invalid_account_key_metadata_#{index}") do
      _with_bootstrap_methods(run_async: lambda do |_command, args, **_options|
        { "stdout" => JSON.generate(args.first == "profile" ? [{ "name" => "DEFAULT", "auth" => "oauth" }] : inventory) }
      end) do
        assert_raises(RuntimeError) { Bootstrap.verify_neon_cli_authentication_async }
      end
    end
  end

  def test_neon_creates_stores_and_verifies_both_environment_credentials
    stored = {}
    commands = []
    _with_neon_store(stored: stored, commands: commands) do
      _with_http_responses(_accepted_neon_responses) { _reconcile_neon }
    end
    assert_equal(["list", "create", "list"], commands.map { |args| args[1] })
    assert_equal 4, @writes.length
    assert_equal "fixture-created-key", stored.fetch(["staging", "NEON_ACCOUNT_API_KEY"])
    assert_equal "fixture-created-key", stored.fetch(["production", "NEON_ACCOUNT_API_KEY"])
    assert_equal "42", stored.fetch(["production", "NEON_ACCOUNT_API_KEY_ID"])
    assert_includes Bootstrap::KNOWN_SECRETS, "fixture-created-key"
    assert_equal ["Neon account API key: create."], @logs
  end

  def test_neon_reuses_healthy_owned_credentials_without_mutation
    stored = _stored_neon_credential
    commands = []
    _with_neon_store(stored: stored, commands: commands) do
      _with_http_responses(_accepted_neon_responses + _accepted_neon_responses) { _reconcile_neon }
    end
    assert_equal(["list", "list"], commands.map { |args| args[1] })
    assert_empty @writes
    assert_equal ["Neon account API key: reuse."], @logs
  end

  def test_neon_repairs_a_missing_environment_without_creating_or_revoking_a_key
    stored = _stored_neon_credential.reject { |(environment, _name), _value| environment == "production" }
    commands = []
    _with_neon_store(stored: stored, commands: commands) do
      _with_http_responses(_accepted_neon_responses + _accepted_neon_responses) { _reconcile_neon }
    end
    assert_equal(["list", "list"], commands.map { |args| args[1] })
    assert_equal(["production", "production"], @writes.map { |write| write.fetch(:environment) })
    assert_equal ["Neon account API key: repair."], @logs
  end

  def test_neon_replaces_only_a_conclusively_rejected_owned_key
    stored = _stored_neon_credential
    commands = []
    _with_neon_store(stored: stored, commands: commands) do
      _with_http_responses([[401, nil]] + _accepted_neon_responses) { _reconcile_neon }
    end
    assert_equal(["list", "revoke", "create", "list"], commands.map { |args| args[1] })
    assert_equal ["api-keys", "revoke", "42"], commands[1].first(3)
    assert_equal ["Neon account API key: replace."], @logs
  end

  def test_neon_refuses_to_report_health_when_storing_a_credential_is_incomplete
    commands = []
    _with_neon_store(stored: {}, commands: commands, skip_production_writes: true) do
      _with_http_responses(_accepted_neon_responses) do
        error = assert_raises(RuntimeError) { _reconcile_neon }
        assert_equal "Final Neon account API key verification failed.", error.message
      end
    end
  end

  def test_neon_rejects_unverified_revocation_before_creating_a_replacement
    commands = []
    _with_neon_store(stored: _stored_neon_credential, commands: commands, revoke_payload: { "id" => 99, "revoked" => true }) do
      _with_http_responses([[401, nil]]) do
        error = assert_raises(RuntimeError) { _reconcile_neon }
        assert_includes error.message, "could not verify revocation"
      end
    end
    assert_equal(["list", "revoke"], commands.map { |args| args[1] })
    assert_empty @writes
  end

  def test_neon_registers_created_secret_before_rejecting_malformed_metadata
    commands = []
    _with_neon_store(stored: {}, commands: commands, create_payload: { "id" => nil, "key" => "fixture-invalid-created-key" }) do
      assert_raises(RuntimeError) { _reconcile_neon }
    end
    assert_includes Bootstrap::KNOWN_SECRETS, "fixture-invalid-created-key"
    assert_empty @writes
  end

  def test_upstash_reuses_an_accepted_key_and_repairs_only_the_missing_environment
    _with_secret_store(stored: { "staging" => "fixture-upstash-key" }) do
      _with_http_responses([[200, []]]) { _reconcile_upstash }
    end
    assert_equal(["production"], @writes.map { |write| write.fetch(:environment) })
    assert_equal "UPSTASH_API_KEY", @writes.first.fetch(:name)
    assert_empty @prompts
    assert_equal ["Upstash API key: reuse."], @logs
  end

  def test_upstash_reuses_a_complete_accepted_key_without_writing_or_prompting
    _with_secret_store(stored: { "staging" => "fixture-upstash-key", "production" => "fixture-upstash-key" }) do
      _with_http_responses([[200, []]]) { _reconcile_upstash }
    end
    assert_empty @writes
    assert_empty @prompts
  end

  def test_upstash_requests_verifies_and_stores_a_missing_key_in_both_environments
    _with_secret_store(stored: {}) do
      _with_http_responses([[200, []]]) { _reconcile_upstash }
    end
    assert_equal(["staging", "production"], @writes.map { |write| write.fetch(:environment) })
    assert_equal ["fixture-supplied-key"], @writes.map { |write| write.fetch(:value) }.uniq
    assert_equal "Upstash management credential", @prompts.first.fetch(:title)
    assert_includes @prompts.first.fetch(:guidance), "fixture@example.test"
  end

  def test_upstash_replaces_a_rejected_key_after_verifying_the_supplied_replacement
    _with_secret_store(stored: { "staging" => "fixture-rejected-key", "production" => "fixture-rejected-key" }) do
      _with_http_responses([[401, nil], [200, []]]) { _reconcile_upstash }
    end
    assert_equal 2, @writes.length
    assert_equal ["Upstash API key: replace."], @logs
  end

  def test_upstash_does_not_prompt_or_write_when_the_existing_key_cannot_be_verified
    _with_secret_store(stored: { "staging" => "fixture-upstash-key" }) do
      _with_http_responses([[500, nil]]) do
        assert_raises(RuntimeError) { _reconcile_upstash }
      end
    end
    assert_empty @writes
    assert_empty @prompts
  end

  def test_upstash_does_not_store_a_rejected_supplied_key
    _with_secret_store(stored: {}) do
      _with_http_responses([[403, nil]]) do
        error = assert_raises(RuntimeError) { _reconcile_upstash }
        assert_equal "The supplied Upstash bootstrap API key is invalid.", error.message
      end
    end
    assert_empty @writes
  end

  def test_meta_prompts_only_for_the_missing_environment_and_preserves_its_runtime_secret_path
    _with_secret_store(stored: { "staging" => "fixture-staging-meta" }) do
      result = _reconcile_meta
      assert_equal({ "action" => "prompt", "environments" => ["production"] }, result)
    end
    assert_includes Bootstrap::KNOWN_SECRETS, "fixture-staging-meta"
    assert_equal(["production"], @writes.map { |write| write.fetch(:environment) })
    assert_equal "/generated/auth/runtime", @writes.first.fetch(:secret_path)
    assert_equal "META_APP_SECRET", @writes.first.fetch(:name)
    assert_equal "Production Meta Auth credential", @prompts.first.fetch(:title)
  end

  def test_meta_keeps_distinct_existing_environment_secrets_without_prompting
    _with_secret_store(stored: { "staging" => "fixture-staging-meta", "production" => "fixture-production-meta" }) do
      assert_equal({ "action" => "reuse", "environments" => [] }, _reconcile_meta)
    end
    assert_empty @prompts
    assert_empty @writes
    assert_includes Bootstrap::KNOWN_SECRETS, "fixture-production-meta"
  end

  def test_meta_replaces_shared_credentials_with_separate_environment_prompts
    _with_secret_store(stored: { "staging" => "fixture-shared-meta", "production" => "fixture-shared-meta" }) do
      assert_equal "replace-shared", _reconcile_meta.fetch("action")
    end
    assert_equal(["staging", "production"], @writes.map { |write| write.fetch(:environment) })
    assert_equal(["Staging Meta Auth credential", "Production Meta Auth credential"], @prompts.map { |prompt| prompt.fetch(:title) })
  end

  private

  def _with_bootstrap_methods(stubs)
    originals = stubs.to_h { |name, _replacement| [name, Bootstrap.method(name)] }
    stubs.each do |name, replacement|
      Bootstrap.define_singleton_method(name) { |*args, **options, &block| replacement.call(*args, **options, &block) }
    end
    yield
  ensure
    originals&.each { |name, original| Bootstrap.define_singleton_method(name, original) }
  end

  def _with_http_responses(responses)
    remaining = responses.dup
    _with_bootstrap_methods(http_request: lambda do |url, **options|
      @requests << options.merge(url: url)
      raise "Unexpected provider request: #{url}" if remaining.empty?

      response = remaining.shift
      raise response if response.is_a?(Exception)
      next response if response.is_a?(Response)

      Response.new(response[0].to_s, JSON.generate(response[1]))
    end) { yield }
    assert_empty remaining, "Expected provider requests were not made"
  end

  def _accepted_neon_responses
    [[200, { "id" => "owner" }], [200, nil], [200, { "members" => [{ "member" => { "user_id" => "owner", "role" => "admin" } }] }]]
  end

  def _stored_neon_credential
    Bootstrap::ENVIRONMENTS.to_h { |environment| [[environment, "NEON_ACCOUNT_API_KEY"], "fixture-created-key"] }
      .merge(Bootstrap::ENVIRONMENTS.to_h { |environment| [[environment, "NEON_ACCOUNT_API_KEY_ID"], "42"] })
  end

  def _with_neon_store(stored:, commands:, skip_production_writes: false,
                       create_payload: { "id" => 42, "name" => "owned-fixture-key", "key" => "fixture-created-key" },
                       revoke_payload: { "id" => 42, "revoked" => true })
    inventory_present = !stored.empty?
    _with_bootstrap_methods(
      get_bootstrap_secret: ->(environment:, name:, **_options) { stored[[environment, name]] },
      set_bootstrap_secret: lambda do |environment:, name:, value:, **options|
        @writes << options.merge(environment: environment, name: name, value: value)
        stored[[environment, name]] = value unless skip_production_writes && environment == "production"
      end,
      run_async: lambda do |command, args, **_options|
        assert_equal "neon", command
        commands << args
        payload = case args[1]
                  when "list"
                    inventory_present ? [{ "id" => 42, "name" => "owned-fixture-key", "project_id" => nil }] : []
                  when "create"
                    inventory_present = true
                    create_payload
                  when "revoke"
                    inventory_present = false
                    revoke_payload
                  else
                    raise "Unexpected Neon fixture command"
                  end
        { "stdout" => JSON.generate(payload) }
      end,
      log: ->(message) { @logs << message }
    ) { yield }
  end

  def _with_secret_store(stored:)
    getter = ->(environment:, **_options) { stored[environment] }
    setter = ->(**options) { @writes << options }
    _with_bootstrap_methods(
      get_bootstrap_secret: getter, get_infisical_secret: getter,
      set_bootstrap_secret: setter, set_infisical_secret: setter,
      prompt_hidden: ->(**options) { @prompts << options; "fixture-supplied-key" },
      log: ->(message) { @logs << message }
    ) { yield }
  end

  def _reconcile_neon
    Bootstrap.reconcile_neon_account_api_key(platforms: @platforms, manifest: @manifest,
                                             infisical_project_id: "fixture-project", infisical_token: "fixture-token")
  end

  def _reconcile_upstash
    Bootstrap.reconcile_upstash_api_key(platforms: @platforms,
                                       infisical_project_id: "fixture-project", infisical_token: "fixture-token")
  end

  def _reconcile_meta
    Bootstrap.reconcile_meta_app_secret(infisical_project_id: "fixture-project", infisical_token: "fixture-token")
  end
end
