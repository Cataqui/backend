# frozen_string_literal: true

require_relative "test_helper"
require_relative "../cloudflare-bootstrap"

class InfrastructureCloudflareBootstrapTest < Minitest::Test
  ProviderResponse = Struct.new(:code, :body)

  def setup
    @platforms = JSON.parse(File.read(File.expand_path("../../platforms.json", __dir__), encoding: Encoding::UTF_8))
    @manifest = JSON.parse(File.read(File.expand_path("../../manifest.json", __dir__), encoding: Encoding::UTF_8))
  end

  def test_distinguishes_rejected_cloudflare_credentials_from_temporary_provider_failures
    _with_methods(http_request: ->(*_args, **_options) { ProviderResponse.new("403", "") }) do
      refute Bootstrap._cloudflare_verify_token("test-bootstrap-credential")
    end
    _with_methods(http_request: ->(*_args, **_options) { ProviderResponse.new("429", "") }) do
      error = assert_raises(RuntimeError) { Bootstrap._cloudflare_verify_token("test-bootstrap-credential") }
      assert_includes error.message, "429"
    end
  end

  def test_requires_an_active_cloudflare_token_with_api_token_write_permission
    responses = [
      ProviderResponse.new("200", JSON.generate("success" => true, "result" => { "status" => "active" })),
      ProviderResponse.new("200", JSON.generate("result" => [{ "name" => "API Tokens Read" }]))
    ]
    _with_methods(http_request: ->(*_args, **_options) { responses.shift }) do
      refute Bootstrap._cloudflare_verify_token("test-bootstrap-credential")
    end
    responses = [
      ProviderResponse.new("200", JSON.generate("success" => true, "result" => { "status" => "active" })),
      ProviderResponse.new("200", JSON.generate("result" => [{ "name" => "API Tokens Write" }]))
    ]
    _with_methods(http_request: ->(*_args, **_options) { responses.shift }) do
      assert Bootstrap._cloudflare_verify_token("test-bootstrap-credential")
    end
  end

  def test_does_not_create_a_state_bucket_when_discovery_is_unauthorized
    calls = []
    run = lambda do |command, args, **_options|
      calls << [command, args]
      raise "Authorization failed"
    end
    _with_methods(run_async: run) do
      assert_raises(RuntimeError) { Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest) }
    end
    assert_equal 1, calls.length
    assert_equal "cf", calls.first.first
    assert_equal ["r2", "buckets", "list"], calls.first.last[0, 3]
  end

  def test_creates_a_conclusively_missing_bucket_and_rejects_public_exposure
    bucket = @manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")
    calls = []
    run = lambda do |_command, args, **_options|
      calls << args
      payload = case args[2]
      when "list" then { "buckets" => [] }
      when "create", "get" then { "name" => bucket }
      when "domains" then { "domains" => [{ "domain" => "state.example.invalid", "enabled" => true }] }
      else raise "Unexpected command"
      end
      { "status" => 0, "stdout" => JSON.generate(payload), "stderr" => "" }
    end
    _with_methods(run_async: run) do
      error = assert_raises(RuntimeError) { Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest) }
      assert_includes error.message, "public custom domain"
    end
    assert_equal(%w[list create get domains], calls.map { |args| args[2] })
    assert_equal ["--name", bucket], calls[1].last(2)
  end

  def test_paginates_bucket_discovery_and_reuses_existing_location_without_mutation
    bucket = @manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")
    calls = []
    responses = [
      { "buckets" => [{ "name" => "a-#{bucket}" }] },
      { "buckets" => [{ "name" => bucket, "location" => "apac" }] },
      { "buckets" => [] },
      { "name" => bucket, "location" => "apac", "jurisdiction" => "default" },
      { "domains" => [] },
      { "enabled" => false }
    ]
    # The exact match may occur on a later page, even when an earlier page is short.
    run = lambda do |command, args, env:|
      calls << [command, args, env]
      { "status" => 0, "stdout" => JSON.generate(responses.shift), "stderr" => "" }
    end
    _with_methods(run_async: run) do
      Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest)
    end
    assert_empty responses
    calls.each do |command, _args, env|
      assert_equal "cf", command
      assert_equal @platforms.dig("cloudflare", "account_id"), env.fetch("CLOUDFLARE_ACCOUNT_ID")
    end
    assert_equal ["--start-after", "a-#{bucket}"], calls[1][1].last(2)
    assert_equal ["--start-after", bucket], calls[2][1].last(2)
    refute(calls.any? { |_command, args, _env| args[2] == "create" })
  end

  def test_bucket_discovery_fails_closed_before_creation_on_invalid_or_repeated_pages
    bucket = @manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")
    [
      ["not-json"],
      [JSON.generate([])],
      [JSON.generate({})],
      [JSON.generate("buckets" => [{}])],
      [JSON.generate("buckets" => [{ "name" => bucket }, { "name" => bucket }])],
      Array.new(2, JSON.generate("buckets" => [{ "name" => bucket }]))
    ].each do |responses|
      calls = []
      run = lambda do |_command, args, **_options|
        calls << args
        { "status" => 0, "stdout" => responses.shift, "stderr" => "" }
      end
      _with_methods(run_async: run) do
        assert_raises(RuntimeError) { Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest) }
      end
      assert(calls.all? { |args| args[2] == "list" })
    end
  end

  def test_r2_probe_signs_its_unique_object_and_deletes_it_after_verification
    calls = []
    request = lambda do |url, method:, headers:, body: nil|
      calls << { "url" => url, "method" => method, "headers" => headers, "body" => body }
      ProviderResponse.new(method == "DELETE" ? "204" : "200", method == "GET" ? calls.first.fetch("body") : "")
    end
    _with_methods(http_request: request) do
      assert Bootstrap.probe_r2_credentials(
        platforms: @platforms, manifest: @manifest,
        access_key_id: "test-access-id", secret_access_key: "test-secret-key"
      )
    end
    assert_equal(%w[PUT GET DELETE], calls.map { |call| call.fetch("method") })
    assert_equal 1, calls.map { |call| call.fetch("url") }.uniq.length
    assert_match %r{/__bootstrap_probe__/[0-9a-f-]{36}\z}, calls.first.fetch("url")
    body = calls.first.fetch("body")
    assert_match(/\A[0-9a-f-]{36}\z/, body)
    calls.each do |call|
      assert_match(/AWS4-HMAC-SHA256 Credential=test-access-id\//, call.fetch("headers").fetch("authorization"))
      expected_hash = Digest::SHA256.hexdigest(call.fetch("method") == "PUT" ? body : "")
      assert_equal expected_hash, call.fetch("headers").fetch("x-amz-content-sha256")
    end
  end

  def test_r2_probe_does_not_treat_service_unavailability_as_rejected_credentials
    _with_methods(http_request: ->(*_args, **_options) { ProviderResponse.new("503", "") }) do
      error = assert_raises(RuntimeError) do
        Bootstrap.probe_r2_credentials(platforms: @platforms, manifest: @manifest,
                                       access_key_id: "test-access-id", secret_access_key: "test-secret-key")
      end
      assert_includes error.message, "503"
    end
  end

  def test_preserves_the_previous_runtime_sigv4_signature_for_a_fixed_request
    captured_headers = nil
    request = lambda do |_url, **options|
      captured_headers = options.fetch(:headers)
      ProviderResponse.new("200", "")
    end
    original_now = Time.method(:now)
    fixed_time = Time.utc(2026, 10, 16, 12, 0, 0)
    Time.define_singleton_method(:now) { fixed_time }
    begin
      _with_methods(http_request: request) do
        Bootstrap._cloudflare_signed_r2_request(
          platforms: { "cloudflare" => { "account_id" => "0123456789abcdef0123456789abcdef" } },
          manifest: @manifest, access_key_id: "test-access-id", secret_access_key: "test-secret-key",
          method: "PUT", key: "__bootstrap_probe__/test-vector", body: "probe-body"
        )
      end
    ensure
      Time.define_singleton_method(:now, original_now)
    end
    assert_equal "20261016T120000Z", captured_headers.fetch("x-amz-date")
    assert_equal(
      "AWS4-HMAC-SHA256 Credential=test-access-id/20261016/auto/s3/aws4_request, " \
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date, " \
      "Signature=682a2d3d2faa2bdb24740fb0e5fad828825f97e7503493db5ffba9ec33417520",
      captured_headers.fetch("authorization")
    )
  end

  def test_refuses_a_foreign_r2_token_before_reading_or_replacing_credentials
    token = { "id" => "foreign-id", "name" => Bootstrap.get_r2_token_name(manifest: @manifest, environment: "staging") }
    test = self
    _with_methods(
      _cloudflare_list_tokens: ->(_credential) { [token] },
      _cloudflare_get_r2_permission_group: ->(_credential) { { "id" => "permission-id" } },
      _cloudflare_get_token: ->(_credential, _id) { token },
      get_bootstrap_secret: ->(**_options) { test.flunk "Foreign ownership must be rejected before secrets are read" }
    ) do
      error = assert_raises(RuntimeError) do
        Bootstrap.reconcile_r2_credentials(platforms: @platforms, manifest: @manifest,
                                           infisical_project_id: "test-project", infisical_token: "test-infisical",
                                           cloudflare_token: "test-cloudflare")
      end
      assert_includes error.message, "Foreign Cloudflare token"
    end
  end

  def test_cloudflare_verification_rejects_inactive_tokens_and_permission_failures
    [
      [ProviderResponse.new("200", JSON.generate("success" => true, "result" => { "status" => "disabled" }))],
      [ProviderResponse.new("200", JSON.generate("success" => true, "result" => { "status" => "active" })), ProviderResponse.new("403", "")]
    ].each do |responses|
      _with_methods(http_request: ->(*_args, **_options) { responses.shift }) do
        refute Bootstrap._cloudflare_verify_token("test-bootstrap-credential")
      end
    end
    responses = [
      ProviderResponse.new("200", JSON.generate("success" => true, "result" => { "status" => "active" })),
      ProviderResponse.new("503", "")
    ]
    _with_methods(http_request: ->(*_args, **_options) { responses.shift }) do
      error = assert_raises(RuntimeError) { Bootstrap._cloudflare_verify_token("test-bootstrap-credential") }
      assert_includes error.message, "Cloudflare permission verification failed with 503"
    end
  end

  def test_reuses_one_verified_cloudflare_bootstrap_token_in_both_environments
    writes = []
    _with_methods(
      get_bootstrap_secret: ->(**_options) { "stored-bootstrap-token" },
      _cloudflare_verify_token: ->(token) { token == "stored-bootstrap-token" },
      prompt_hidden: ->(**_options) { raise "A healthy stored token must not require input" },
      set_bootstrap_secret: ->(**options) { writes << options }
    ) do
      assert_equal "stored-bootstrap-token", Bootstrap.resolve_cloudflare_bootstrap_token("project-id", "infisical-token")
    end
    assert_equal(%w[staging production], writes.map { |write| write.fetch(:environment) })
    assert(writes.all? { |write| write.fetch(:value) == "stored-bootstrap-token" })
  end

  def test_requests_a_replacement_only_when_the_stored_bootstrap_token_is_rejected
    writes = []
    prompted = []
    _with_methods(
      get_bootstrap_secret: ->(**_options) { "rejected-bootstrap-token" },
      _cloudflare_verify_token: ->(token) { token == "replacement-bootstrap-token" },
      prompt_hidden: ->(**options) { prompted << options; "replacement-bootstrap-token" },
      set_bootstrap_secret: ->(**options) { writes << options }
    ) do
      assert_equal "replacement-bootstrap-token", Bootstrap.resolve_cloudflare_bootstrap_token("project-id", "infisical-token")
    end
    assert_equal 1, prompted.length
    assert_equal 2, writes.length
    assert(writes.all? { |write| write.fetch(:value) == "replacement-bootstrap-token" })
  end

  def test_rejects_conflicting_bootstrap_tokens_and_invalid_prompted_credentials_without_writes
    _with_methods(
      get_bootstrap_secret: ->(environment:, **_options) { "#{environment}-token" },
      set_bootstrap_secret: ->(**_options) { raise "Conflicting tokens must not be overwritten" }
    ) do
      error = assert_raises(RuntimeError) { Bootstrap.resolve_cloudflare_bootstrap_token("project-id", "infisical-token") }
      assert_includes error.message, "different Cloudflare bootstrap tokens"
    end
    _with_methods(
      get_bootstrap_secret: ->(**_options) { nil },
      prompt_hidden: ->(**_options) { "invalid-bootstrap-token" },
      _cloudflare_verify_token: ->(_token) { false },
      set_bootstrap_secret: ->(**_options) { raise "Invalid tokens must not be written" }
    ) do
      error = assert_raises(RuntimeError) { Bootstrap.resolve_cloudflare_bootstrap_token("project-id", "infisical-token") }
      assert_includes error.message, "invalid or lacks API Tokens Write"
    end
  end

  def test_r2_probe_fails_closed_on_rejected_reads_unexpected_contents_and_cleanup_failure
    [
      { "statuses" => ["403"], "outcome" => false },
      { "statuses" => ["200", "401"], "outcome" => false },
      { "statuses" => ["200", "503"], "error" => "could not read" },
      { "statuses" => ["200", "200"], "body" => "unexpected-contents", "error" => "unexpected probe contents" },
      { "statuses" => ["200", "200", "503"], "error" => "could not remove" }
    ].each do |scenario|
      body = nil
      request = lambda do |_url, method:, **options|
        body = options.fetch(:body) if method == "PUT"
        ProviderResponse.new(scenario.fetch("statuses").shift, scenario.fetch("body", body))
      end
      _with_methods(http_request: request) do
        if scenario.key?("error")
          error = assert_raises(RuntimeError) { _probe_credentials }
          assert_includes error.message, scenario.fetch("error")
        else
          assert_equal scenario.fetch("outcome"), _probe_credentials
        end
      end
    end
  end

  def test_r2_bucket_readback_rejects_malformed_foreign_or_public_resources
    bucket = @manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")
    [
      { "info" => "invalid-json", "error" => "invalid response" },
      { "info" => JSON.generate("name" => "foreign-bucket"), "error" => "foreign R2 bucket" },
      { "domains" => {}, "error" => "custom-domain exposure" },
      { "domains" => { "domains" => [{ "domain" => "state.example.invalid", "enabled" => false }] }, "error" => "public custom domain" },
      { "dev" => {}, "error" => "development URL exposure" },
      { "dev" => { "enabled" => "false" }, "error" => "development URL exposure" },
      { "dev" => { "enabled" => true }, "error" => "public development URL" },
      {}
    ].each do |scenario|
      run = lambda do |_command, args, **_options|
        case args[2]
        when "list"
          payload = args.include?("--start-after") ? [] : [{ "name" => bucket }]
          { "status" => 0, "stdout" => JSON.generate("buckets" => payload), "stderr" => "" }
        when "get"
          { "status" => 0, "stdout" => scenario.fetch("info", JSON.generate("name" => bucket)), "stderr" => "" }
        when "domains"
          payload = args[3] == "custom" ? scenario.fetch("domains", { "domains" => [] }) : scenario.fetch("dev", { "enabled" => false })
          { "status" => 0, "stdout" => JSON.generate(payload), "stderr" => "" }
        else raise "Unexpected command"
        end
      end
      _with_methods(run_async: run) do
        if scenario.key?("error")
          error = assert_raises(RuntimeError) { Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest) }
          assert_includes error.message, scenario.fetch("error")
        else
          Bootstrap.ensure_private_r2_bucket(platforms: @platforms, manifest: @manifest)
        end
      end
    end
  end

  def test_replaces_only_owned_inactive_r2_credentials_and_reuses_the_healthy_environment
    bucket = @manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")
    account_id = @platforms.dig("cloudflare", "account_id")
    tokens = Bootstrap::ENVIRONMENTS.map do |environment|
      {
        "id" => "#{environment}-access-id", "status" => environment == "staging" ? "disabled" : "active",
        "name" => "#{bucket}-#{environment}",
        "policies" => [{ "effect" => "allow", "permission_groups" => [{ "id" => "permission-id" }],
                         "resources" => { "com.cloudflare.edge.r2.bucket.#{account_id}_default_#{bucket}" => "*" } }]
      }
    end
    deletions = []
    creations = []
    writes = []
    request = lambda do |url, method: "GET", **options|
      if url.end_with?("permission_groups")
        { "result" => [{ "id" => "permission-id", "name" => "Workers R2 Storage Bucket Item Write",
                         "scopes" => ["com.cloudflare.edge.r2.bucket"] }] }
      elsif url.include?("?per_page=")
        { "result" => tokens }
      elsif method == "POST"
        creations << options.fetch(:body)
        { "result" => { "id" => "replacement-access-id", "value" => "replacement-token-value" } }
      elsif method == "DELETE"
        deletions << url.split("/").last
        { "result" => true }
      else
        { "result" => tokens.find { |token| url.end_with?(token.fetch("id")) } }
      end
    end
    _with_methods(
      request_json: request,
      get_bootstrap_secret: ->(environment:, name:, **_options) { name == "R2_STATE_ACCESS_KEY_ID" ? "#{environment}-access-id" : "stored-secret" },
      set_bootstrap_secret: ->(**options) { writes << options },
      probe_r2_credentials: ->(**_options) { true }
    ) do
      Bootstrap.reconcile_r2_credentials(platforms: @platforms, manifest: @manifest,
                                         infisical_project_id: "project-id", infisical_token: "infisical-token",
                                         cloudflare_token: "cloudflare-token")
    end
    assert_equal ["staging-access-id"], deletions
    assert_equal 1, creations.length
    assert_equal "#{bucket}-staging", creations.first.fetch("name")
    assert_equal 2, writes.length
    assert(writes.all? { |write| write.fetch(:environment) == "staging" })
    assert_equal Digest::SHA256.hexdigest("replacement-token-value"), writes.last.fetch(:value)
  end

  def test_creates_missing_r2_credentials_and_requires_successful_readback
    writes = []
    created = []
    _with_methods(
      _cloudflare_list_tokens: ->(_token) { [] },
      _cloudflare_get_r2_permission_group: ->(_token) { { "id" => "permission-id" } },
      get_bootstrap_secret: ->(**_options) { nil },
      _cloudflare_create_r2_token: ->(**options) { created << options; { "id" => "new-access-id", "secret" => "new-secret" } },
      set_bootstrap_secret: ->(**options) { writes << options },
      probe_r2_credentials: ->(**_options) { false }
    ) do
      error = assert_raises(RuntimeError) do
        Bootstrap.reconcile_r2_credentials(platforms: @platforms, manifest: @manifest,
                                           infisical_project_id: "project-id", infisical_token: "infisical-token",
                                           cloudflare_token: "cloudflare-token")
      end
      assert_includes error.message, "New staging R2 credentials could not access"
    end
    assert_equal 1, created.length
    assert_equal 2, writes.length
  end

  def test_rejects_ambiguous_permission_groups_or_missing_created_token_values
    _with_methods(request_json: ->(*_args, **_options) { { "result" => [] } }) do
      error = assert_raises(RuntimeError) { Bootstrap._cloudflare_get_r2_permission_group("bootstrap-token") }
      assert_includes error.message, "exactly one"
    end
    _with_methods(
      _cloudflare_get_r2_permission_group: ->(_token) { { "id" => "permission-id" } },
      request_json: ->(*_args, **_options) { { "result" => { "id" => "created-id" } } }
    ) do
      error = assert_raises(RuntimeError) do
        Bootstrap._cloudflare_create_r2_token(platforms: @platforms, manifest: @manifest,
                                             cloudflare_token: "bootstrap-token", name: "state-staging")
      end
      assert_includes error.message, "did not return credentials"
    end
  end

  private

  def _probe_credentials
    Bootstrap.probe_r2_credentials(platforms: @platforms, manifest: @manifest,
                                   access_key_id: "test-access-id", secret_access_key: "test-secret-key")
  end

  def _with_methods(implementations)
    originals = implementations.keys.to_h { |name| [name, Bootstrap.method(name)] }
    implementations.each { |name, implementation| Bootstrap.define_singleton_method(name, implementation) }
    yield
  ensure
    originals&.each { |name, implementation| Bootstrap.define_singleton_method(name, implementation) }
  end
end
