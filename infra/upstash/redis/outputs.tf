output "database" {
  description = "Non-secret identity, location, and observed database type for the environment's Upstash Redis database."
  value = {
    database_id    = upstash_redis_database.auth.database_id
    database_name  = upstash_redis_database.auth.database_name
    database_type  = upstash_redis_database.auth.database_type
    primary_region = upstash_redis_database.auth.primary_region
    rest_url       = "https://${upstash_redis_database.auth.endpoint}"
  }
}

output "redis_rest_token" {
  description = "Sensitive REST token synchronized to Infisical for the Cataquí API runtime."
  value       = upstash_redis_database.auth.rest_token
  sensitive   = true
}
