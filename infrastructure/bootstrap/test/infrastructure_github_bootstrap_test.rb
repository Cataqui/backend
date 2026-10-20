# frozen_string_literal: true

require_relative "test_helper"
require_relative "../github-bootstrap"

class InfrastructureGithubBootstrapTest < Minitest::Test
  def _with_command_stub(handler)
    original = Bootstrap.method(:run_async)
    Bootstrap.define_singleton_method(:run_async) { |*args, **options| handler.call(*args, **options) }
    yield
  ensure
    Bootstrap.define_singleton_method(:run_async, original)
  end

  def test_immutable_oidc_prefix_is_parsed_from_github_cli
    _with_command_stub(lambda do |command, args, **_options|
      assert_equal "gh", command
      assert_equal ["api", "repos/Cataqui/backend/actions/oidc/customization/sub", "--method", "GET"], args
      {"status" => 0, "stdout" => JSON.generate({"sub_claim_prefix" => "repo:Cataqui@123/backend@456"}), "stderr" => ""}
    end) do
      assert_equal "repo:Cataqui@123/backend@456", Bootstrap.get_github_oidc_subject_prefix("Cataqui/backend")
    end
  end

  def test_invalid_oidc_metadata_fails_closed
    ["not-json", JSON.generate({"sub_claim_prefix" => "repo:Foreign@123/backend@456"})].each do |payload|
      _with_command_stub(->(*) { {"status" => 0, "stdout" => payload, "stderr" => ""} }) do
        assert_raises(RuntimeError) { Bootstrap.get_github_oidc_subject_prefix("Cataqui/backend") }
      end
    end
  end

  def test_environment_inspection_failure_never_creates_or_updates_resources
    calls = []
    _with_command_stub(lambda do |_command, args, **_options|
      calls << args
      {"status" => 1, "stdout" => "", "stderr" => "HTTP 403 Forbidden"}
    end) do
      assert_raises(RuntimeError) { _reconcile }
      assert_equal 1, calls.length
      assert_equal "GET", calls.first.last
    end
  end

  def test_environment_reconciliation_preserves_reviewers_timers_and_self_review_policy
    state = {
      "protection_rules" => [
        {"type" => "wait_timer", "wait_timer" => 30},
        {"type" => "required_reviewers", "reviewers" => [{"type" => "Team", "reviewer" => {"id" => 7}}]}
      ],
      "prevent_self_review" => true,
      "deployment_branch_policy" => {"protected_branches" => true, "custom_branch_policies" => false}
    }
    policies = [{"id" => 1, "name" => "old-branch", "type" => "branch"}]
    variables = []
    updates = []
    _with_command_stub(lambda do |_command, args, **_options|
      if args.first == "variable"
        variables << {"name" => args[2], "value" => args.last}
        next {"status" => 0, "stdout" => "", "stderr" => ""}
      end
      path = args[1]
      operation = args[3]
      payload = if path.end_with?("/variables?per_page=100")
        {"variables" => variables}
      elsif path.end_with?("/deployment-branch-policies/1")
        assert_equal "DELETE", operation
        policies.clear
        {}
      elsif path.end_with?("/deployment-branch-policies")
        if operation == "POST"
          policies << {"id" => 2, "name" => "staging", "type" => "branch"}
          {}
        else
          {"branch_policies" => policies.map(&:dup)}
        end
      elsif operation == "PUT"
        updates << args
        state["deployment_branch_policy"] = {"protected_branches" => false, "custom_branch_policies" => true}
        state
      else
        state
      end
      {"status" => 0, "stdout" => JSON.generate(payload), "stderr" => ""}
    end) do
      _reconcile
    end
    assert_equal 1, updates.length
    %w[wait_timer=30 prevent_self_review=true reviewers[0][type]=Team reviewers[0][id]=7].each do |field|
      assert_includes updates.first, field
    end
    assert_equal(["staging"], policies.map { |policy| policy.fetch("name") })
    assert_equal(["INFISICAL_OPENTOFU_IDENTITY_ID", "GOOGLE_WORKLOAD_IDENTITY_PROVIDER"], variables.map { |item| item.fetch("name") })
  end

  def test_tag_named_main_is_replaced_with_a_branch_policy
    policies = [{"id" => 1, "name" => "main", "type" => "tag"},
                {"id" => 2, "name" => "staging", "type" => "branch"}]
    removed = []
    _with_command_stub(lambda do |_command, args, **_options|
      path = args[1]
      operation = args[3]
      payload = if path.end_with?("/variables?per_page=100")
        {"variables" => [{"name" => "INFISICAL_OPENTOFU_IDENTITY_ID", "value" => "identity-id"}, {"name" => "GOOGLE_WORKLOAD_IDENTITY_PROVIDER", "value" => "provider-id"}]}
      elsif path.end_with?("/deployment-branch-policies/1")
        assert_equal "DELETE", operation
        removed << 1
        policies.reject! { |policy| policy["id"] == 1 }
        {}
      elsif path.end_with?("/deployment-branch-policies")
        if operation == "POST"
          assert_includes args, "name=main"
          assert_includes args, "type=branch"
          policies << {"id" => 3, "name" => "main", "type" => "branch"}
          {}
        else
          {"branch_policies" => policies.map(&:dup)}
        end
      else
        {"protection_rules" => [], "deployment_branch_policy" => {"protected_branches" => false, "custom_branch_policies" => true}}
      end
      {"status" => 0, "stdout" => JSON.generate(payload), "stderr" => ""}
    end) do
      Bootstrap.reconcile_github_environment(
        platforms: {"github" => {"repository" => "Cataqui/backend"}},
        manifest: {"github" => {"environments" => {"staging" => {"branches" => %w[staging main]}}}},
        environment: "staging", identity_id: "identity-id", google_auth: {"provider" => "provider-id"}
      )
    end
    assert_equal [1], removed
    assert_equal(%w[branch branch], policies.map { |policy| policy.fetch("type") })
  end

  def _reconcile
    Bootstrap.reconcile_github_environment(
      platforms: {"github" => {"repository" => "Cataqui/backend"}},
      manifest: {"github" => {"environments" => {"staging" => {"branches" => ["staging"]}}}},
      environment: "staging", identity_id: "identity-id", google_auth: {"provider" => "provider-id"}
    )
  end
end
