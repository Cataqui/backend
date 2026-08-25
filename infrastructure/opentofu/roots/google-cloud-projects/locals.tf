locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  google_cloud_organization_id = regex("^[0-9]+$", local.platforms.google_cloud.organization_id)
  google_cloud_billing_account = regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", local.platforms.google_cloud.billing_account_id)

  project_by_environment = {
    staging = {
      name      = "cataqui-staging"
      id_prefix = "cataqui-staging"
    }
    production = {
      name      = "cataqui-production"
      id_prefix = "cataqui-production"
    }
  }

  project = local.project_by_environment[var.environment]
}
