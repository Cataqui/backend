resource "postgresql_role" "db_user" {
  name                      = local.database_runtime_username
  superuser                 = false
  create_database           = false
  create_role               = false
  inherit                   = true
  login                     = true
  replication               = false
  bypass_row_level_security = false
  connection_limit          = -1
  encrypted_password        = true
  password_wo               = ephemeral.random_password.db_user.result
  password_wo_version       = tostring(local.db_user_credentials_version)

  lifecycle {
    prevent_destroy = true
  }
}

resource "postgresql_grant" "database" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  object_type = "database"
  privileges  = ["CONNECT"]
}

resource "postgresql_grant" "schema" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  schema      = "public"
  object_type = "schema"
  privileges  = ["USAGE"]
}

resource "postgresql_grant" "tables" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  schema      = "public"
  object_type = "table"
  objects     = []
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

resource "postgresql_grant" "sequences" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  schema      = "public"
  object_type = "sequence"
  objects     = []
  privileges  = ["USAGE", "SELECT", "UPDATE"]
}

resource "postgresql_default_privileges" "tables" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  owner       = local.database_owner_username
  schema      = "public"
  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

resource "postgresql_default_privileges" "sequences" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  owner       = local.database_owner_username
  schema      = "public"
  object_type = "sequence"
  privileges  = ["USAGE", "SELECT", "UPDATE"]
}

resource "postgresql_default_privileges" "types" {
  database    = local.database_name
  role        = postgresql_role.db_user.name
  owner       = local.database_owner_username
  schema      = "public"
  object_type = "type"
  privileges  = ["USAGE"]
}

resource "infisical_secret" "database_app_pooler_url" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/runtime"
  name             = "DATABASE_APP_POOLER_URL"
  value_wo         = local.database_app_pooler_url
  value_wo_version = local.db_user_credentials_version

  depends_on = [postgresql_role.db_user]
}
