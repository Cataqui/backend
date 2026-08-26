resource "neon_org_api_key" "project_access" {
  name       = local.project_api_key.name
  org_id     = local.neon_organization_id
  project_id = var.neon_project_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "neon_project_api_key" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/deployment"
  name             = "NEON_PROJECT_API_KEY"
  value_wo         = neon_org_api_key.project_access.key
  value_wo_version = local.project_api_key_version

  lifecycle {
    prevent_destroy = true
  }
}
