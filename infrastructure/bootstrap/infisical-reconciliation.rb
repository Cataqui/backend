# frozen_string_literal: true

require_relative "reconciliation"

module Bootstrap
  INFISICAL_PROJECT_TYPE = "secret-manager"

  def self.classify_infisical_oidc_inspection(status:, payload:)
    return "present" if status >= 200 && status < 300
    return "missing" if status == 404 || (status == 400 && payload.is_a?(Hash) && payload["message"] == "The identity does not have OIDC Auth attached")
    raise "Unable to inspect Infisical OIDC trust (#{status})."
  end

  def self.explain_infisical_identity_creation_failure(error:, environment:)
    message = error.is_a?(Exception) ? error.message : error.to_s
    if /identity limit reached/i.match?(message)
      return RuntimeError.new("Infisical identity capacity is exhausted. The #{environment} environment requires its own OIDC identity to preserve staging and production isolation. Increase the organization's identity capacity or intentionally remove an unused identity, then rerun bootstrap.")
    end
    error.is_a?(Exception) ? error : RuntimeError.new(message)
  end

  def self.is_infisical_privilege_already_present(error:, privilege_slug:)
    message = error.is_a?(Exception) ? error.message : error.to_s
    message.include?("Additional privilege with name #{privilege_slug} exists")
  end

  def self.resolve_infisical_privilege(privileges:, privilege_slug:)
    matches = privileges.select { |privilege| privilege["slug"] == privilege_slug }
    raise "Duplicate Infisical privileges use slug #{privilege_slug}." if matches.length > 1
    matches[0]
  end

  def self.decide_infisical_project(projects:, expected_organization_id:, expected_name:, expected_slug:)
    matches = projects.select { |project| project["slug"] == expected_slug }
    raise "Duplicate Infisical projects use slug #{expected_slug}." if matches.length > 1
    return { "action" => "create" } if matches.empty?
    project = matches[0]
    if project["orgId"] != expected_organization_id
      raise "Infisical project #{expected_slug} belongs to a foreign organization."
    end
    if project["type"] != INFISICAL_PROJECT_TYPE
      raise "Infisical project #{expected_slug} is not a secret-manager project."
    end
    { "action" => project["name"] == expected_name && project["hasDeleteProtection"] ? "reuse" : "reconcile", "project" => project }
  end

  def self.assert_infisical_organization_scope(projects:, expected_organization_id:)
    organization_ids = projects.map { |project| project["orgId"] }.uniq
    if organization_ids.length != 1 || !organization_ids.include?(expected_organization_id)
      raise "Infisical session is not scoped exclusively to organization #{expected_organization_id}."
    end
  end

  def self.get_missing_infisical_environments(project:)
    environments = project["environments"].is_a?(Array) ? project["environments"] : []
    ENVIRONMENTS.each do |environment|
      matches = environments.select { |candidate| candidate["slug"] == environment }
      raise "Duplicate Infisical environment slug #{environment}." if matches.length > 1
    end
    ENVIRONMENTS.reject { |environment| environments.any? { |candidate| candidate["slug"] == environment } }
  end

  def self.assert_infisical_project_contract(project:, expected_organization_id:, expected_name:, expected_slug:)
    unless project.is_a?(Hash) && project["orgId"] == expected_organization_id && project["name"] == expected_name && project["slug"] == expected_slug && project["type"] == INFISICAL_PROJECT_TYPE && project["hasDeleteProtection"] == true && get_missing_infisical_environments(project: project).empty?
      raise "Infisical project #{expected_slug} failed final verification."
    end
    project
  end

  def self.reconcile_infisical_project_state(expected_organization_id:, expected_name:, expected_slug:, list_projects:, create_project:, update_project:, create_environment:)
    projects = list_projects.call
    assert_infisical_organization_scope(projects: projects, expected_organization_id: expected_organization_id)
    decision = decide_infisical_project(projects: projects, expected_organization_id: expected_organization_id, expected_name: expected_name, expected_slug: expected_slug)
    project = decision["project"]
    if decision["action"] == "create"
      project = create_project.call
      if !project.is_a?(Hash) || project["orgId"] != expected_organization_id
        raise "Created Infisical project #{expected_slug} in an unexpected organization."
      end
    elsif decision["action"] == "reconcile"
      project = update_project.call(project)
    end
    if decision["action"] != "reuse"
      projects = list_projects.call
      refreshed = decide_infisical_project(projects: projects, expected_organization_id: expected_organization_id, expected_name: expected_name, expected_slug: expected_slug)
      raise "Infisical project #{expected_slug} disappeared during reconciliation." unless refreshed["project"]
      project = refreshed["project"]
    end
    get_missing_infisical_environments(project: project).each do |environment|
      create_environment.call({ "projectId" => project["id"], "environment" => environment })
    end
    projects = list_projects.call
    verified = decide_infisical_project(projects: projects, expected_organization_id: expected_organization_id, expected_name: expected_name, expected_slug: expected_slug)
    raise "Infisical project #{expected_slug} disappeared during reconciliation." unless verified["project"]
    assert_infisical_project_contract(project: verified["project"], expected_organization_id: expected_organization_id, expected_name: expected_name, expected_slug: expected_slug)["id"]
  end

  def self.reconcile_infisical_folder_state(name:, list_folders:, create_folder:)
    folders = list_folders.call
    raise "Infisical returned an invalid folder inventory." unless folders.is_a?(Array)
    return if resolve_unique_named_resource(resources: folders, expected_name: name)
    create_folder.call
    verified = list_folders.call
    raise "Infisical returned an invalid folder inventory." unless verified.is_a?(Array)
    unless resolve_unique_named_resource(resources: verified, expected_name: name)
      raise "Infisical folder #{name} is missing after creation."
    end
  end
end
