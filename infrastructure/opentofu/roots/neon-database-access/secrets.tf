ephemeral "infisical_secret" "database_owner_host" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/api/deployment"
  name         = "DATABASE_OWNER_HOST"
}

ephemeral "infisical_secret" "database_owner_password" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/api/deployment"
  name         = "DATABASE_OWNER_PASSWORD"
}

ephemeral "infisical_secret" "database_pooler_host" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/api/deployment"
  name         = "DATABASE_POOLER_HOST"
}

ephemeral "random_password" "db_user" {
  length      = 40
  lower       = true
  min_lower   = 1
  min_numeric = 1
  min_upper   = 1
  numeric     = true
  special     = false
  upper       = true
}

# Read the persisted passwords so retries use the same credentials after a partial apply.
ephemeral "infisical_secret" "auth_owner_password" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = infisical_secret.auth_owner_password.folder_path
  name         = infisical_secret.auth_owner_password.name
  depends_on   = [infisical_secret.auth_owner_password]
}

ephemeral "infisical_secret" "auth_user_password" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = infisical_secret.hyperdrive_origin_password.folder_path
  name         = infisical_secret.hyperdrive_origin_password.name
  depends_on   = [infisical_secret.hyperdrive_origin_password]
}
