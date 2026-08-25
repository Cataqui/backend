locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  google_cloud_organization_id = regex("^[0-9]+$", local.platforms.google_cloud.organization_id)
  google_cloud_billing_account = regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", local.platforms.google_cloud.billing_account_id)

  project_by_environment = {
    staging = {
      name       = "cataqui-staging"
      project_id = local.platforms.google_cloud.projects.cataqui_staging
    }
    production = {
      name       = "cataqui-production"
      project_id = local.platforms.google_cloud.projects.cataqui_production
    }
  }

  project = {
    name = local.project_by_environment[var.environment].name
    id = regex(
      "^[a-z][a-z0-9-]{4,28}[a-z0-9]$",
      local.project_by_environment[var.environment].project_id,
    )
  }
}
