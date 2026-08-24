locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id        = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)
  database_name               = regex("^[a-z][a-z0-9_]*$", local.platforms.neon.database.name)
  database_owner_username     = regex("^[a-z][a-z0-9_]*$", local.platforms.neon.database.owner_role)
  database_runtime_username   = regex("^[a-z][a-z0-9_]*$", local.platforms.neon.database.runtime_role)
  db_user_credentials_version = 1

  database_app_pooler_url = "postgresql://${local.database_runtime_username}:${ephemeral.random_password.db_user.result}@${ephemeral.infisical_secret.database_pooler_host.value}:5432/${local.database_name}?sslmode=require"
}
