locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id = module.infisical_project.id
  neon_organization_id = regex("^org-[a-z0-9-]+$", local.platforms.neon.organization_id)

  project_api_key_by_environment = {
    staging = {
      name = local.manifest.neon.api_keys.project_access.cataqui_staging.name
    }
    production = {
      name = local.manifest.neon.api_keys.project_access.cataqui_production.name
    }
  }

  project_api_key         = local.project_api_key_by_environment[var.environment]
  project_api_key_version = 1
}
