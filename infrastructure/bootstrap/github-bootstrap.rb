# frozen_string_literal: true

require_relative "bootstrap-runtime"
require_relative "github-reconciliation"

module Bootstrap
  module_function

  def _github_api(repository, path, method: "GET", fields: [], allow_failure: false)
    args = ["api", "repos/#{repository}#{path}", "--method", method]
    fields.each { |key, value| args.concat(["-F", "#{key}=#{value}"]) }
    run_async("gh", args, allow_failure: allow_failure)
  end

  def get_github_oidc_subject_prefix(repository)
    result = _github_api(repository, "/actions/oidc/customization/sub")
    begin
      payload = JSON.parse(result.fetch("stdout"))
    rescue JSON::ParserError
      raise "GitHub returned invalid OIDC subject configuration for #{repository}."
    end
    parse_github_oidc_subject_prefix(repository: repository, payload: payload)
  end

  def reconcile_github_environment(platforms:, manifest:, environment:, identity_id:, google_auth:)
    repository = platforms.fetch("github").fetch("repository")
    branches = manifest.fetch("github").fetch("environments").fetch(environment).fetch("branches")
    variables = {"INFISICAL_OPENTOFU_IDENTITY_ID" => identity_id,
                 "GOOGLE_WORKLOAD_IDENTITY_PROVIDER" => google_auth.fetch("provider")}
    result = _github_api(repository, "/environments/#{environment}", allow_failure: true)
    if result.fetch("status") != 0 && !/HTTP 404|Not Found/i.match?(result.fetch("stderr"))
      raise "Unable to inspect GitHub environment #{environment}: #{result.fetch('stderr').strip}"
    end
    current = result.fetch("status").zero? ? JSON.parse(result.fetch("stdout")) : {}
    protection_rules = current.fetch("protection_rules", [])
    fields = [
      ["deployment_branch_policy[protected_branches]", "false"],
      ["deployment_branch_policy[custom_branch_policies]", "true"],
      ["wait_timer", (protection_rules.find { |rule| rule["type"] == "wait_timer" }&.fetch("wait_timer", 0) || 0).to_s],
      ["prevent_self_review", current.fetch("prevent_self_review", false).to_s]
    ]
    reviewers = protection_rules.find { |rule| rule["type"] == "required_reviewers" }&.fetch("reviewers", []) || []
    reviewers.each_with_index do |reviewer, index|
      fields.concat([["reviewers[#{index}][type]", reviewer.fetch("type")],
                     ["reviewers[#{index}][id]", reviewer.fetch("reviewer").fetch("id").to_s]])
    end
    if result.fetch("status") != 0 || current.dig("deployment_branch_policy", "protected_branches") != false ||
       current.dig("deployment_branch_policy", "custom_branch_policies") != true
      _github_api(repository, "/environments/#{environment}", method: "PUT", fields: fields)
    end

    policies = JSON.parse(_github_api(repository, "/environments/#{environment}/deployment-branch-policies")
                           .fetch("stdout")).fetch("branch_policies", [])
    branches = Set.new(branches)
    policies.each do |policy|
      next if policy.fetch("type") == "branch" && branches.include?(policy.fetch("name"))

      _github_api(repository, "/environments/#{environment}/deployment-branch-policies/#{policy.fetch('id')}",
                  method: "DELETE")
    end
    branches.each do |branch|
      next if policies.any? { |policy| policy["name"] == branch && policy["type"] == "branch" }

      _github_api(repository, "/environments/#{environment}/deployment-branch-policies", method: "POST",
                  fields: [["name", branch], ["type", "branch"]])
    end

    current_variables = JSON.parse(_github_api(repository, "/environments/#{environment}/variables?per_page=100")
                                    .fetch("stdout")).fetch("variables")
    variables.each do |name, value|
      next if current_variables.find { |variable| variable["name"] == name }&.fetch("value") == value

      run_async("gh", ["variable", "set", name, "--repo", repository, "--env", environment, "--body", value])
    end

    verified = JSON.parse(_github_api(repository, "/environments/#{environment}").fetch("stdout"))
    unless verified.dig("deployment_branch_policy", "protected_branches") == false &&
           verified.dig("deployment_branch_policy", "custom_branch_policies") == true
      raise "GitHub environment policy verification failed for #{environment}."
    end
    verified_policies = JSON.parse(_github_api(repository, "/environments/#{environment}/deployment-branch-policies")
                                    .fetch("stdout")).fetch("branch_policies")
    unless verified_policies.map { |policy| [policy.fetch("name"), policy.fetch("type")] }.sort ==
           branches.to_a.map { |branch| [branch, "branch"] }.sort
      raise "GitHub branch policy verification failed for #{environment}."
    end
    verified_variables = JSON.parse(_github_api(repository, "/environments/#{environment}/variables?per_page=100")
                                     .fetch("stdout")).fetch("variables")
    variables.each do |name, value|
      next if verified_variables.find { |variable| variable["name"] == name }&.fetch("value") == value

      raise "GitHub variable verification failed for #{environment}: #{name}."
    end
  end
end
