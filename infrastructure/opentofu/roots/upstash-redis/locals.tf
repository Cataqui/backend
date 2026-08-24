locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)

  database_by_environment = {
    staging = {
      name           = "cataqui-api-staging"
      monthly_budget = 5
    }
    production = {
      name           = "cataqui-api-production"
      monthly_budget = 25
    }
  }

  database = local.database_by_environment[var.environment]

  redis_rest_host = endswith(upstash_redis_database.api.endpoint, ".upstash.io") ? upstash_redis_database.api.endpoint : "${upstash_redis_database.api.endpoint}.upstash.io"
  redis_rest_url  = "https://${local.redis_rest_host}"
}
