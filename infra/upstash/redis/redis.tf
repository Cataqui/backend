resource "upstash_redis_database" "auth" {
  database_name  = local.redis_configuration.database_name
  region         = "global"
  primary_region = "sa-east-1"
  read_regions   = []
  tls            = true
  eviction       = false
  auto_scale     = false
  prod_pack      = false

  lifecycle {
    prevent_destroy = true

    postcondition {
      condition     = self.database_type == local.redis_configuration.database_type
      error_message = "The selected Upstash account created ${var.environment} with database type '${self.database_type}', but this environment requires '${local.redis_configuration.database_type}'. Use Upstash credentials whose account defaults to the required database type."
    }
  }
}
