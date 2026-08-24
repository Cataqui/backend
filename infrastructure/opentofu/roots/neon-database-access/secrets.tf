ephemeral "infisical_secret" "database_owner_host" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/deployment"
  name         = "DATABASE_OWNER_HOST"
}

ephemeral "infisical_secret" "database_owner_password" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/deployment"
  name         = "DATABASE_OWNER_PASSWORD"
}

ephemeral "infisical_secret" "database_pooler_host" {
  workspace_id = local.infisical_project_id
  env_slug     = var.environment
  folder_path  = "/generated/deployment"
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
