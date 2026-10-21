# frozen_string_literal: true

require_relative "test_helper"
require "rbconfig"
require_relative "../bootstrap"

class InfrastructureBootstrapCommandTest < Minitest::Test
  def _with_stubs(stubs)
    originals = stubs.to_h { |name, _handler| [name, Bootstrap.method(name)] }
    stubs.each do |name, handler|
      Bootstrap.define_singleton_method(name) { |*args, **options, &block| handler.call(*args, **options, &block) }
    end
    yield
  ensure
    originals&.each { |name, original| Bootstrap.define_singleton_method(name, original) }
  end

  def test_command_line_modes_are_rejected_before_acquiring_lock_or_mutating_providers
    previous = ARGV.dup
    ARGV.replace(["--check"])
    _with_stubs(acquire_lock: -> { flunk "Lock must not be acquired for invalid arguments" }) do
      error = assert_raises(RuntimeError) { Bootstrap.main }
      assert_equal "infrastructure:bootstrap accepts no arguments.", error.message
    end
  ensure
    ARGV.replace(previous)
  end

  def test_orchestrator_reconciles_both_environments_and_releases_lock
    previous = ARGV.dup
    ARGV.clear
    events = []
    stubs = _provider_stubs(events)
    _with_stubs(stubs) { Bootstrap.main }
    assert_equal(["staging", "production"], events.filter_map { |name, value| value if name == :identity })
    assert_equal(["staging", "production"], events.filter_map { |name, value| value if name == :github })
    assert_equal(2, events.count { |name, _value| name == :probe })
    assert_operator events.index([:folders, nil]), :<, events.index([:credentials, nil])
    assert_equal [:finish, nil], events[-2]
    assert_equal [:release, nil], events.last
  ensure
    ARGV.replace(previous)
  end

  def test_bootstrap_configuration_is_utf8_independent_of_process_locale
    stdout, stderr, status = Open3.capture3({"LC_ALL" => "C", "COVERAGE" => nil}, RbConfig.ruby, __FILE__,
                                            "--name", "test_orchestrator_reconciles_both_environments_and_releases_lock")
    assert status.success?, "ASCII-locale bootstrap fixture failed: #{stdout}\n#{stderr}"
  end

  def test_provider_failure_stops_later_operations_and_releases_lock
    previous = ARGV.dup
    ARGV.clear
    events = []
    stubs = _provider_stubs(events)
    stubs[:reconcile_r2_credentials] = ->(**) { raise "Provider inspection failed" }
    _with_stubs(stubs) { assert_raises(RuntimeError) { Bootstrap.main } }
    refute(events.any? { |name, _value| [:folders, :credentials, :identity, :finish].include?(name) })
    assert_equal [:release, nil], events.last
  ensure
    ARGV.replace(previous)
  end

  def test_final_backend_probe_failure_stops_completion_and_releases_lock
    previous = ARGV.dup
    ARGV.clear
    events = []
    stubs = _provider_stubs(events)
    stubs[:probe_r2_credentials] = ->(**) { false }
    _with_stubs(stubs) do
      error = assert_raises(RuntimeError) { Bootstrap.main }
      assert_equal "Final staging R2 verification failed.", error.message
    end
    refute_includes events, [:finish, nil]
    assert_equal [:release, nil], events.last
  ensure
    ARGV.replace(previous)
  end

  def test_local_authentication_verifies_provider_tools_account_and_repository
    tools = []
    commands = []
    _with_stubs(_authentication_stubs(tools, commands)) do
      Bootstrap._validate_local_authentication(_platforms)
    end
    assert_equal %w[cf gcloud gh infisical neon tofu], tools.sort
    assert_includes commands, ["cf", ["auth", "whoami"]]
    assert_includes commands, ["gcloud", ["auth", "application-default", "print-access-token"]]
    assert_includes commands, ["infisical", ["login", "status", "--json"]]
  end

  def test_cloudflare_authentication_requires_valid_credentials_and_exact_account_membership
    ["unauthenticated", "invalid-token", "partial-account", "missing-accounts", "malformed-accounts"].each do |fault|
      _with_stubs(_authentication_stubs([], [], fault: fault)) do
        error = assert_raises(RuntimeError) { Bootstrap._validate_local_authentication(_platforms) }
        assert_includes error.message, "not authenticated to Cloudflare account owned-account"
      end
    end
  end

  def test_wrong_cloudflare_account_or_github_repository_rejects_authentication
    ["wrong-account", "wrong-repository"].each do |fault|
      stubs = _authentication_stubs([], [], fault: fault)
      _with_stubs(stubs) do
        error = assert_raises(RuntimeError) { Bootstrap._validate_local_authentication(_platforms) }
        assert_match(/not authenticated|Authenticated repository/, error.message)
      end
    end
  end

  def test_infisical_cli_session_is_registered_immediately_and_empty_session_is_rejected
    _with_stubs(run_async: ->(*) { {"stdout" => "  fixture-session-token\n"} }) do
      assert_equal "fixture-session-token", Bootstrap._get_infisical_token
      assert Bootstrap::KNOWN_SECRETS.include?("fixture-session-token")
    end
    _with_stubs(run_async: ->(*) { {"stdout" => "  \n"} }) do
      assert_raises(RuntimeError) { Bootstrap._get_infisical_token }
    end
  ensure
    Bootstrap::KNOWN_SECRETS.clear
  end

  def _platforms
    {"cloudflare" => {"account_id" => "owned-account"}, "github" => {"repository" => "Cataqui/backend"}}
  end

  def _authentication_stubs(tools, commands, fault: nil)
    {
      require_tool_async: ->(tool) { tools << tool },
      verify_neon_cli_authentication_async: -> {},
      run_async: lambda { |command, args|
        commands << [command, args]
        stdout = if command == "cf"
          accounts = [{"id" => fault == "wrong-account" ? "foreign-account" : "owned-account"}]
          accounts = [{"id" => "prefix-owned-account-suffix"}] if fault == "partial-account"
          accounts = ["owned-account"] if fault == "malformed-accounts"
          accounts = nil if fault == "missing-accounts"
          JSON.generate({"authenticated" => fault != "unauthenticated", "tokenValid" => fault != "invalid-token", "accounts" => accounts})
        elsif command == "gh"
          JSON.generate({"nameWithOwner" => fault == "wrong-repository" ? "Foreign/backend" : "Cataqui/backend"})
        else
          ""
        end
        {"status" => 0, "stdout" => stdout, "stderr" => ""}
      }
    }
  end

  def _provider_stubs(events)
    {
      acquire_lock: -> { -> { events << [:release, nil] } },
      start_bootstrap_ui: -> {},
      finish_bootstrap_ui: -> { events << [:finish, nil] },
      run_bootstrap_phase: ->(**, &operation) { operation.call },
      _validate_local_authentication: ->(_platforms) {},
      get_github_oidc_subject_prefix: ->(_repository) { "repo:Cataqui@123/backend@456" },
      _get_infisical_token: -> { "fixture-token" },
      reconcile_infisical_project: ->(_input, _token) { "project-id" },
      ensure_private_r2_bucket: ->(**) {},
      ensure_bootstrap_folders: ->(_project_id, _token) {},
      resolve_cloudflare_bootstrap_token: ->(_project_id, _token) { "fixture-cloudflare-token" },
      reconcile_r2_credentials: ->(**) {},
      apply_generated_folders: ->(_project_id, _token) { events << [:folders, nil] },
      reconcile_meta_app_secret: ->(**) { events << [:credentials, nil] },
      reconcile_upstash_api_key: ->(**) {},
      reconcile_neon_account_api_key: ->(**) {},
      reconcile_google_projects: ->(**) {},
      apply_google_github_auth: ->(_project_id, _token, _prefix) { {"provider" => "provider-id"} },
      reconcile_infisical_identity: lambda { |environment:, **|
        events << [:identity, environment]
        "#{environment}-identity"
      },
      reconcile_github_environment: ->(environment:, **) { events << [:github, environment] },
      get_backend_credentials: ->(_project_id, _token, _environment) { {"accessKeyId" => "fixture-id", "secretAccessKey" => "fixture-key"} },
      probe_r2_credentials: ->(**) { events << [:probe, nil]; true }
    }
  end
end
