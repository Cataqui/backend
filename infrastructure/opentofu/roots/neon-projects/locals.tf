locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id     = module.infisical_project.id
  neon_organization_id     = regex("^org-[a-z0-9-]+$", local.platforms.neon.organization_id)
  database_name            = regex("^[a-z][a-z0-9_]*$", local.platforms.neon.database.name)
  database_owner_role_name = regex("^[a-z][a-z0-9_]*$", local.platforms.neon.database.owner_role)

  project_by_environment = {
    staging = {
      name                      = "cataqui-staging"
      autoscaling_limit_min_cu  = 0.25
      autoscaling_limit_max_cu  = 1
      history_retention_seconds = 86400
      maintenance_weekday       = 6
    }
    production = {
      name                      = "cataqui-production"
      autoscaling_limit_min_cu  = 0.25
      autoscaling_limit_max_cu  = 2
      history_retention_seconds = 604800
      maintenance_weekday       = 7
    }
  }

  project = local.project_by_environment[var.environment]
}
