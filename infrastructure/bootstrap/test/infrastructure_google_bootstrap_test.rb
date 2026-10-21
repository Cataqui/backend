# frozen_string_literal: true

require_relative "test_helper"
require_relative "../google-cloud-bootstrap"

class InfrastructureGoogleBootstrapTest < Minitest::Test
  def setup
    @platforms = JSON.parse(File.read(File.expand_path("../../platforms.json", __dir__), encoding: Encoding::UTF_8))
    @manifest = JSON.parse(File.read(File.expand_path("../../manifest.json", __dir__), encoding: Encoding::UTF_8))
  end

  def test_removes_saved_google_plan_when_apply_fails
    plan_path = nil
    calls = []
    test = self
    run = lambda do |_command, args, **_options|
      calls << args
      if args.first == "plan"
        plan_path = args[args.index("-out") + 1]
        File.write(plan_path, "test-plan")
        { "status" => 0, "stdout" => "", "stderr" => "" }
      else
        test.assert_equal plan_path, args.last
        test.assert File.exist?(plan_path)
        raise "Test apply failed"
      end
    end
    _with_methods(run_async: run) do
      error = assert_raises(RuntimeError) do
        Bootstrap._google_apply_root(root: "/test/google-root", environment_variables: {})
      end
      assert_equal "Test apply failed", error.message
    end
    assert_equal %w[plan apply], calls.map(&:first)
    refute File.exist?(plan_path)
  end

  def test_does_not_apply_a_plan_when_planning_fails_and_removes_partial_plan
    plan_path = nil
    test = self
    run = lambda do |_command, args, **_options|
      test.assert_equal "plan", args.first
      plan_path = args[args.index("-out") + 1]
      File.write(plan_path, "partial-test-plan")
      raise "Test plan failed"
    end
    _with_methods(run_async: run) do
      assert_raises(RuntimeError) do
        Bootstrap._google_apply_root(root: "/test/google-root", environment_variables: {})
      end
    end
    refute File.exist?(plan_path)
  end

  def test_surfaces_sensitive_plan_cleanup_failure_instead_of_reporting_success
    plan_path = nil
    original_unlink = File.method(:unlink)
    File.define_singleton_method(:unlink) do |path|
      raise Errno::EACCES, path if path == plan_path

      original_unlink.call(path)
    end
    run = lambda do |_command, args, **_options|
      plan_path = args[args.index("-out") + 1] if args.first == "plan"
      { "status" => 0, "stdout" => "", "stderr" => "" }
    end
    begin
      _with_methods(run_async: run) do
        error = assert_raises(Errno::EACCES) do
          Bootstrap._google_apply_root(root: "/test/google-root", environment_variables: {})
        end
        assert_includes error.message, plan_path
      end
    ensure
      File.define_singleton_method(:unlink, original_unlink)
    end
    refute File.exist?(plan_path)
  end

  def test_distinguishes_absent_google_state_from_failed_state_inspection
    absent = { "status" => 1, "stdout" => "", "stderr" => "No stored state was found" }
    _with_methods(run_async: ->(*_args, **_options) { absent }) do
      assert_equal({ "projectIds" => [], "taintedProjectIds" => [] },
                   Bootstrap._google_state_projects(root: "/test/google-root", environment_variables: {}))
    end
    unavailable = { "status" => 1, "stdout" => "", "stderr" => "Authentication failed" }
    _with_methods(run_async: ->(*_args, **_options) { unavailable }) do
      error = assert_raises(RuntimeError) do
        Bootstrap._google_state_projects(root: "/test/google-root", environment_variables: {})
      end
      assert_includes error.message, "Authentication failed"
    end
  end

  def test_preserves_tainted_project_identities_without_unrelated_state_resources
    state = {
      "resources" => [
        { "type" => "google_project", "name" => "cataqui", "instances" => [
          { "attributes" => { "project_id" => "cataqui-test" }, "status" => "tainted" },
          { "attributes" => { "project_id" => "healthy-test" } }
        ] },
        { "type" => "google_project", "name" => "foreign", "instances" => [
          { "attributes" => { "project_id" => "foreign-test" } }
        ] }
      ]
    }
    result = { "status" => 0, "stdout" => JSON.generate(state), "stderr" => "" }
    _with_methods(run_async: ->(*_args, **_options) { result }) do
      assert_equal({ "projectIds" => ["cataqui-test", "healthy-test"], "taintedProjectIds" => ["cataqui-test"] },
                   Bootstrap._google_state_projects(root: "/test/google-root", environment_variables: {}))
    end
  end

  def test_initializes_the_explicit_environment_backend_with_credentials_outside_arguments
    calls = []
    credentials = { "accessKeyId" => "test-access-id", "secretAccessKey" => "test-secret-key" }
    _with_methods(run_async: ->(command, args, **options) { calls << [command, args, options] }) do
      root = Bootstrap._google_initialize_root(root_name: "google-cloud-projects", environment: "staging", credentials: credentials)
      command, args, options = calls.fetch(0)
      assert_equal "tofu", command
      assert_equal root, options.fetch(:cwd)
      assert_includes args, "-backend-config=../../environments/staging/google-cloud-projects.s3.tfbackend"
      refute_includes args.join(" "), "test-secret-key"
      assert_equal "test-access-id", options.fetch(:env).fetch("AWS_ACCESS_KEY_ID")
      assert_equal "test-secret-key", options.fetch(:env).fetch("AWS_SECRET_ACCESS_KEY")
      assert_equal "1", options.fetch(:env).fetch("TF_IN_AUTOMATION")
    end
  end

  def test_reconciles_both_google_environments_through_create_import_recovery_and_reuse
    [
      { "staging" => "recover", "production" => "import" },
      { "staging" => "create", "production" => "reconcile" }
    ].each do |initial_actions|
      calls = []
      applied = {}
      projects = @manifest.fetch("google_cloud").fetch("projects")
      organization_id = @platforms.fetch("google_cloud").fetch("organization_id")
      run = lambda do |command, args, **options|
        calls << [command, args, options]
        if command == "gcloud"
          project_id = args.fetch(2)
          environment = Bootstrap::ENVIRONMENTS.find { |candidate| projects.fetch("cataqui_#{candidate}").fetch("id") == project_id }
          if initial_actions.fetch(environment) == "create" && !applied[environment]
            { "status" => 1, "stdout" => "", "stderr" => "NOT_FOUND" }
          else
            { "status" => 0, "stdout" => JSON.generate("projectId" => project_id,
                                                      "parent" => "organizations/#{organization_id}",
                                                      "lifecycleState" => "ACTIVE"), "stderr" => "" }
          end
        else
          environment = options.fetch(:env).fetch("AWS_ACCESS_KEY_ID").delete_suffix("-access-id")
          project_id = projects.fetch("cataqui_#{environment}").fetch("id")
          if args[0, 2] == ["state", "pull"]
            instances = if applied[environment] || %w[recover reconcile].include?(initial_actions.fetch(environment))
              [{ "attributes" => { "project_id" => project_id },
                 "status" => initial_actions.fetch(environment) == "recover" && !applied[environment] ? "tainted" : "ready" }]
            else
              []
            end
            { "status" => 0, "stdout" => JSON.generate("resources" => [
              { "type" => "google_project", "name" => "cataqui", "instances" => instances }
            ]), "stderr" => "" }
          else
            applied[environment] = true if args.first == "apply"
            { "status" => 0, "stdout" => "", "stderr" => "" }
          end
        end
      end
      _with_methods(
        run_async: run,
        get_bootstrap_secret: ->(environment:, name:, **_options) { name == "R2_STATE_ACCESS_KEY_ID" ? "#{environment}-access-id" : "#{environment}-secret" },
        log: ->(_message) {}
      ) do
        Bootstrap.reconcile_google_projects(platforms: @platforms, manifest: @manifest,
                                            infisical_project_id: "project-id", infisical_token: "infisical-token")
      end
      assert_equal({ "staging" => true, "production" => true }, applied)
      assert_equal(2, calls.count { |command, args, _options| command == "tofu" && args.first == "init" })
      assert_equal(initial_actions.values.count("recover"), calls.count { |command, args, _options| command == "tofu" && args.first == "untaint" })
      plans = calls.select { |command, args, _options| command == "tofu" && args.first == "plan" }
      plans.each do |_command, args, options|
        environment = options.fetch(:env).fetch("AWS_ACCESS_KEY_ID").delete_suffix("-access-id")
        assert_includes args, "-var=environment=#{environment}"
        assert_includes args, "-var=enable_imports=#{initial_actions.fetch(environment) == "import"}"
      end
    end
  end

  def test_explains_failed_atomic_claims_when_google_cannot_disclose_project_ownership
    run = lambda do |command, args, **_options|
      if command == "gcloud"
        { "status" => 1, "stdout" => "", "stderr" => "The caller does not have permission. " \
          "does not have permission to access projects instance or it may not exist" }
      elsif args.first == "plan"
        raise "Project creation rejected"
      elsif args.first == "state"
        { "status" => 0, "stdout" => JSON.generate("resources" => []), "stderr" => "" }
      else
        { "status" => 0, "stdout" => "", "stderr" => "" }
      end
    end
    _with_methods(run_async: run, get_bootstrap_secret: ->(**_options) { "test-credential" }, log: ->(_message) {}) do
      error = assert_raises(RuntimeError) do
        Bootstrap.reconcile_google_projects(platforms: @platforms, manifest: @manifest,
                                            infisical_project_id: "project-id", infisical_token: "infisical-token")
      end
      assert_includes error.message, "atomic creation attempt failed"
      assert_includes error.message, "Project creation rejected"
    end
  end

  def test_preserves_non_claim_failures_and_rejects_unsuccessful_post_apply_ownership
    ["apply-fails", "readback-unowned"].each do |scenario|
      discovery = { "kind" => "found", "project" => { "parent" => "organizations/#{@platforms.dig("google_cloud", "organization_id")}" } }
      _with_methods(
        get_backend_credentials: ->(*_args) { { "accessKeyId" => "test-id", "secretAccessKey" => "test-secret" } },
        _google_initialize_root: ->(**_options) { "/test/google-root" },
        _google_discover_project: ->(_project_id) { discovery },
        _google_state_projects: ->(**_options) { { "projectIds" => [], "taintedProjectIds" => [] } },
        _google_apply_root: ->(**_options) { raise "Original apply failure" if scenario == "apply-fails" },
        log: ->(_message) {}
      ) do
        error = assert_raises(RuntimeError) do
          Bootstrap.reconcile_google_projects(platforms: @platforms, manifest: @manifest,
                                              infisical_project_id: "project-id", infisical_token: "infisical-token")
        end
        if scenario == "apply-fails"
          assert_equal "Original apply failure", error.message
        else
          assert_includes error.message, "was not owned by the expected state after import"
        end
      end
    end
  end

  def test_github_auth_uses_the_production_backend_and_returns_the_verified_provider_output
    calls = []
    run = lambda do |_command, args, **options|
      calls << [args, options]
      { "status" => 0, "stdout" => args.first == "output" ? JSON.generate(
        "workload_identity_provider" => { "value" => "projects/test/locations/global/workloadIdentityPools/github/providers/github" }
      ) : "", "stderr" => "" }
    end
    environments = []
    secret = lambda do |environment:, **_options|
      environments << environment
      "test-backend-credential"
    end
    _with_methods(run_async: run, get_bootstrap_secret: secret) do
      assert_equal({ "provider" => "projects/test/locations/global/workloadIdentityPools/github/providers/github" },
                   Bootstrap.apply_google_github_auth("project-id", "infisical-token", "repo:Cataqui@1/backend@2"))
    end
    assert_equal ["production"], environments.uniq
    assert_equal(%w[init plan apply output], calls.map { |args, _options| args.first })
    assert_includes calls.first.first, "-backend-config=../../environments/production/google-cloud-github-auth.s3.tfbackend"
    assert_includes calls[1].first, "-var=github_oidc_subject_prefix=repo:Cataqui@1/backend@2"
  end

  def test_refuses_to_initialize_google_roots_with_incomplete_backend_credentials
    _with_methods(get_bootstrap_secret: ->(**_options) { nil }) do
      error = assert_raises(RuntimeError) { Bootstrap.get_backend_credentials("project-id", "infisical-token", "staging") }
      assert_includes error.message, "Missing staging R2 backend credentials"
    end
  end

  private

  def _with_methods(implementations)
    originals = implementations.keys.to_h { |name| [name, Bootstrap.method(name)] }
    implementations.each { |name, implementation| Bootstrap.define_singleton_method(name, implementation) }
    yield
  ensure
    originals&.each { |name, implementation| Bootstrap.define_singleton_method(name, implementation) }
  end
end
