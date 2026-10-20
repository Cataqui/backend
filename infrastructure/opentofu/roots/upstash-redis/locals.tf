locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id = module.infisical_project.id

  database_by_environment = {
    staging = {
      name           = local.manifest.upstash.redis.databases.cataqui_api_staging.name
      monthly_budget = 20
    }
    production = {
      name           = local.manifest.upstash.redis.databases.cataqui_api_production.name
      monthly_budget = 25
    }
  }

  auth_database_name = local.manifest.upstash.redis.databases["cataqui_auth_${var.environment}"].name
  database           = local.database_by_environment[var.environment]

  redis_rest_host = endswith(upstash_redis_database.api.endpoint, ".upstash.io") ? upstash_redis_database.api.endpoint : "${upstash_redis_database.api.endpoint}.upstash.io"
  redis_rest_url  = "https://${local.redis_rest_host}"
}
