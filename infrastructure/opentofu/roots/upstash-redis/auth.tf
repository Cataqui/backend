resource "upstash_redis_database" "auth" {
  database_name  = local.auth_database_name
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

resource "infisical_secret" "auth_redis_rest_url" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/auth/runtime"
  name             = "UPSTASH_REDIS_REST_URL"
  value_wo         = "https://${trimsuffix(upstash_redis_database.auth.endpoint, ".upstash.io")}.upstash.io"
  value_wo_version = 1
}

resource "infisical_secret" "auth_redis_rest_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/auth/runtime"
  name             = "UPSTASH_REDIS_REST_TOKEN"
  value_wo         = upstash_redis_database.auth.rest_token
  value_wo_version = 1
}
