data "infisical_projects" "this" {
  slug = var.project_slug
}

check "project_contract" {
  assert {
    condition = (
      data.infisical_projects.this.org_id == var.organization_id &&
      data.infisical_projects.this.name == var.project_name &&
      data.infisical_projects.this.type == "secret-manager" &&
      contains(keys(data.infisical_projects.this.environments), var.environment)
    )
    error_message = "The resolved Infisical project must match the expected organization, name, secret-manager type, and environment."
  }
}
