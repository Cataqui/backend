locals {
  database_configuration_by_environment = {
    staging = {
      project_name    = "cataqui-api-staging"
      branch_name     = "staging"
      database_name   = "cataqui-staging"
      owner_role_name = "cataqui_staging_owner"
      app_role_name   = "cataqui_staging_app"
    }
    production = {
      project_name    = "cataqui-api-production"
      branch_name     = "production"
      database_name   = "cataqui-production"
      owner_role_name = "cataqui_production_owner"
      app_role_name   = "cataqui_production_app"
    }
  }

  database_configuration = local.database_configuration_by_environment[var.environment]
}
