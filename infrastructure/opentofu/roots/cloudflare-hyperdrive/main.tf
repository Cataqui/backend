locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))
}

# The official provider persists origin.password in protected state; it has no
# Terraform write-only attribute. Plans and logs stay private and are removed by CI.
resource "cloudflare_hyperdrive_config" "auth" {
  account_id = local.platforms.cloudflare.account_id
  name       = local.manifest.cloudflare.hyperdrive["auth_${var.environment}"].name
  origin = {
    database = local.manifest.neon.databases.auth.name
    host     = var.database_host
    port     = 5432
    scheme   = "postgres"
    user     = local.manifest.neon.databases.auth.runtime_role
    password = var.database_password
  }
  caching = { disabled = true }

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "auth_hyperdrive_id" {
  workspace_id = module.infisical_project.id
  env_slug     = var.environment
  folder_path  = "/generated/auth/deployment"
  name         = "HYPERDRIVE_ID"
  value        = cloudflare_hyperdrive_config.auth.id
}
