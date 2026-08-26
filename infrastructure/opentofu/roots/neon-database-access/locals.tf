locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id        = module.infisical_project.id
  database_name               = regex("^[a-z][a-z0-9_]*$", local.manifest.neon.databases.cataqui.name)
  database_owner_username     = regex("^[a-z][a-z0-9_]*$", local.manifest.neon.databases.cataqui.owner_role)
  database_runtime_username   = regex("^[a-z][a-z0-9_]*$", local.manifest.neon.databases.cataqui.runtime_role)
  db_user_credentials_version = 1

  database_app_pooler_url = "postgresql://${local.database_runtime_username}:${ephemeral.random_password.db_user.result}@${ephemeral.infisical_secret.database_pooler_host.value}:5432/${local.database_name}?sslmode=require"
}
