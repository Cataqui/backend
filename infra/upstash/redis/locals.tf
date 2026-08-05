locals {
  redis_configuration_by_environment = {
    staging = {
      database_name = "cataqui-api-staging"
      database_type = "Pay as You Go"
    }
    production = {
      database_name = "cataqui-api-production"
      database_type = "Pay as You Go"
    }
  }

  redis_configuration = local.redis_configuration_by_environment[var.environment]
}
