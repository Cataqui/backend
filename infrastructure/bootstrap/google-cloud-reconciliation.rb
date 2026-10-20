# frozen_string_literal: true

require "json"

module Bootstrap
  def self.decide_google_project(expected_project_id:, expected_organization_id:, remote_state_project_ids:, project_discovery:, tainted_project_ids: [])
    managed_ids = remote_state_project_ids.uniq
    tainted_ids = tainted_project_ids.uniq
    if managed_ids.any? { |project_id| project_id != expected_project_id }
      raise "Google project state contains an unexpected protected project instead of #{expected_project_id}."
    end
    if tainted_ids.any? { |project_id| !managed_ids.include?(project_id) }
      raise "Google project state contains an invalid tainted project instance."
    end
    if project_discovery["kind"] == "missing"
      if managed_ids.include?(expected_project_id)
        raise "Google project state manages #{expected_project_id}, but the project no longer exists."
      end
      return "create"
    end
    if project_discovery["kind"] == "hidden-or-missing"
      if managed_ids.include?(expected_project_id)
        raise "Google project state manages #{expected_project_id}, but its ownership cannot be verified."
      end
      return "claim"
    end
    discovered_project = project_discovery.fetch("project")
    parent = discovered_project["parent"]
    belongs_to_organization = if parent.is_a?(String)
      parent == "organizations/#{expected_organization_id}"
    else
      parent.is_a?(Hash) && parent["id"].to_s == expected_organization_id.to_s && parent["type"] == "organization"
    end
    raise "Google project ID #{expected_project_id} belongs outside the declared organization." unless belongs_to_organization
    if discovered_project["lifecycleState"] && discovered_project["lifecycleState"] != "ACTIVE"
      raise "Google project ID #{expected_project_id} is not active."
    end
    return tainted_ids.include?(expected_project_id) ? "recover" : "reconcile" if managed_ids.include?(expected_project_id)
    "import"
  end

  def self.classify_google_project_discovery(project_id:, status:, stdout:, stderr:)
    if status == 0
      begin
        return { "kind" => "found", "project" => JSON.parse(stdout) }
      rescue JSON::ParserError
        raise "Google Cloud returned invalid project metadata for #{project_id}."
      end
    end
    output = "#{stdout}\n#{stderr}"
    if /NOT_FOUND|not found|does not exist/i.match?(output) && !/or it may not exist/i.match?(output)
      return { "kind" => "missing" }
    end
    if /does not have permission to access projects instance/i.match?(output) && /or it may not exist/i.match?(output) && /The caller does not have permission/i.match?(output)
      return { "kind" => "hidden-or-missing" }
    end
    raise "Unable to determine ownership of Google project #{project_id}: #{stderr.strip}"
  end
end
