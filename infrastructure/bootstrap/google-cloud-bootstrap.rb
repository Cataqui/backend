# frozen_string_literal: true

require "json"
require "securerandom"
require "tmpdir"
require_relative "bootstrap-runtime"
require_relative "google-cloud-reconciliation"
require_relative "infisical-bootstrap"
require_relative "reconciliation"

module Bootstrap
  def self._google_backend_environment(credentials)
    ENV.to_h.merge(
      "AWS_ACCESS_KEY_ID" => credentials.fetch("accessKeyId"),
      "AWS_SECRET_ACCESS_KEY" => credentials.fetch("secretAccessKey"),
      "TF_IN_AUTOMATION" => "1"
    )
  end

  def self._google_initialize_root(root_name:, environment:, credentials:)
    root = File.join(REPO_ROOT, "infrastructure/opentofu/roots", root_name)
    run_async(
      "tofu",
      [
        "init", "-reconfigure", "-input=false",
        "-backend-config=../../backends/r2.s3.tfbackend",
        "-backend-config=../../environments/#{environment}/#{root_name}.s3.tfbackend"
      ],
      cwd: root,
      env: _google_backend_environment(credentials)
    )
    root
  end

  def self._google_state_projects(root:, environment_variables:)
    state = run_async("tofu", ["state", "pull"], cwd: root, env: environment_variables, allow_failure: true)
    unless state.fetch("status") == 0
      if /No stored state|state snapshot was not found/i.match?(state.fetch("stderr"))
        return { "projectIds" => [], "taintedProjectIds" => [] }
      end

      raise "Unable to inspect Google project state: #{state.fetch("stderr").strip}"
    end

    payload = JSON.parse(state.fetch("stdout"))
    instances = (payload["resources"] || [])
      .select { |resource| resource["type"] == "google_project" && resource["name"] == "cataqui" }
      .flat_map { |resource| resource["instances"] || [] }
    {
      "projectIds" => instances.filter_map { |instance| instance.dig("attributes", "project_id") },
      "taintedProjectIds" => instances.select { |instance| instance["status"] == "tainted" }
        .filter_map { |instance| instance.dig("attributes", "project_id") }
    }
  end

  def self._google_discover_project(project_id)
    result = run_async("gcloud", ["projects", "describe", project_id, "--format=json"], allow_failure: true)
    classify_google_project_discovery(
      project_id: project_id, status: result.fetch("status"),
      stdout: result.fetch("stdout"), stderr: result.fetch("stderr")
    )
  end

  def self._google_apply_root(root:, environment_variables:, variables: [])
    plan_path = File.join(Dir.tmpdir, "cataqui-bootstrap-#{File.basename(root)}-#{SecureRandom.uuid}.tfplan")
    begin
      run_async("tofu", ["plan", "-input=false", "-out", plan_path, *variables], cwd: root, env: environment_variables)
      run_async("tofu", ["apply", "-input=false", "-auto-approve", plan_path], cwd: root, env: environment_variables)
    ensure
      begin
        File.unlink(plan_path)
      rescue Errno::ENOENT
        # Planning can fail before OpenTofu creates its temporary plan.
        nil
      end
    end
  end

  def self.get_backend_credentials(infisical_project_id, infisical_token, environment)
    access_key_id = get_bootstrap_secret(
      project_id: infisical_project_id, token: infisical_token,
      environment: environment, name: "R2_STATE_ACCESS_KEY_ID"
    )
    secret_access_key = get_bootstrap_secret(
      project_id: infisical_project_id, token: infisical_token,
      environment: environment, name: "R2_STATE_SECRET_ACCESS_KEY"
    )
    if !access_key_id || access_key_id.empty? || !secret_access_key || secret_access_key.empty?
      raise "Missing #{environment} R2 backend credentials after reconciliation."
    end

    { "accessKeyId" => access_key_id, "secretAccessKey" => secret_access_key }
  end

  def self.reconcile_google_projects(platforms:, manifest:, infisical_project_id:, infisical_token:)
    ENVIRONMENTS.each do |environment|
      credentials = get_backend_credentials(infisical_project_id, infisical_token, environment)
      root = _google_initialize_root(root_name: "google-cloud-projects", environment: environment, credentials: credentials)
      environment_variables = _google_backend_environment(credentials)
      project_id = manifest.fetch("google_cloud").fetch("projects").fetch("cataqui_#{environment}").fetch("id")
      discovery = _google_discover_project(project_id)
      state = _google_state_projects(root: root, environment_variables: environment_variables)
      action = decide_google_project(
        expected_project_id: project_id,
        expected_organization_id: platforms.fetch("google_cloud").fetch("organization_id"),
        remote_state_project_ids: state.fetch("projectIds"),
        tainted_project_ids: state.fetch("taintedProjectIds"),
        project_discovery: discovery
      )
      log("Google project #{environment}: #{action}.")
      if action == "recover"
        run_async("tofu", ["untaint", "google_project.cataqui"], cwd: root, env: environment_variables)
      end

      begin
        _google_apply_root(
          root: root, environment_variables: environment_variables,
          variables: ["-var=environment=#{environment}", "-var=enable_imports=#{action == "import"}"]
        )
      rescue StandardError => error
        raise unless action == "claim"

        raise "Google could not inspect #{project_id}, and its atomic creation attempt failed. The project ID may already belong to another account, or the active account may lack Project Creator or Billing Account User access. #{error.message}"
      end

      verified_state = _google_state_projects(root: root, environment_variables: environment_variables)
      verified_action = decide_google_project(
        expected_project_id: project_id,
        expected_organization_id: platforms.fetch("google_cloud").fetch("organization_id"),
        remote_state_project_ids: verified_state.fetch("projectIds"),
        tainted_project_ids: verified_state.fetch("taintedProjectIds"),
        project_discovery: _google_discover_project(project_id)
      )
      unless verified_action == "reconcile"
        raise "Google project #{project_id} was not owned by the expected state after #{action}."
      end
    end
  end

  def self.apply_google_github_auth(infisical_project_id, infisical_token, github_oidc_subject_prefix)
    credentials = get_backend_credentials(infisical_project_id, infisical_token, "production")
    root = _google_initialize_root(root_name: "google-cloud-github-auth", environment: "production", credentials: credentials)
    environment_variables = _google_backend_environment(credentials)
    _google_apply_root(
      root: root, environment_variables: environment_variables,
      variables: ["-var=github_oidc_subject_prefix=#{github_oidc_subject_prefix}"]
    )
    output = JSON.parse(run_async("tofu", ["output", "-json"], cwd: root, env: environment_variables).fetch("stdout"))
    { "provider" => output.fetch("workload_identity_provider").fetch("value") }
  end
end
