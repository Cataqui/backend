locals {
  redis_configuration_by_environment = {
    staging = {
      database_name = "cataqui-api-staging"
      plan          = "free"
    }
    production = {
      database_name = "cataqui-api-production"
      plan          = "payg"
    }
  }

  redis_configuration = local.redis_configuration_by_environment[var.environment]
}
