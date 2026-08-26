resource "upstash_redis_database" "api" {
  database_name  = local.database.name
  region         = "global"
  primary_region = "sa-east-1"
  read_regions   = []

  tls        = true
  eviction   = false
  auto_scale = false
  budget     = local.database.monthly_budget
  prod_pack  = false

  lifecycle {
    prevent_destroy = true

    postcondition {
      condition     = self.database_type == "Pay as You Go"
      error_message = "The Upstash account must create a paid Redis database before runtime credentials can be published."
    }
  }
}

resource "infisical_secret" "upstash_redis_rest_url" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "UPSTASH_REDIS_REST_URL"
  value_wo         = local.redis_rest_url
  value_wo_version = 1
}

resource "infisical_secret" "upstash_redis_rest_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "UPSTASH_REDIS_REST_TOKEN"
  value_wo         = upstash_redis_database.api.rest_token
  value_wo_version = 1
}
