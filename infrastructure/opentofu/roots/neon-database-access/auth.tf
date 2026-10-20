ephemeral "random_password" "auth_owner" {
  length  = 40
  special = false
}

ephemeral "random_password" "auth_user" {
  length  = 40
  special = false
}

resource "postgresql_role" "auth_owner" {
  name                      = local.manifest.neon.databases.auth.owner_role
  login                     = true
  superuser                 = false
  create_database           = false
  create_role               = false
  replication               = false
  bypass_row_level_security = false
  password_wo               = ephemeral.random_password.auth_owner.result
  password_wo_version       = "1"

  lifecycle {
    prevent_destroy = true
  }
}

resource "postgresql_grant_role" "auth_owner_administration" {
  role              = local.database_owner_username
  grant_role        = postgresql_role.auth_owner.name
  with_admin_option = true
}

resource "postgresql_database" "auth" {
  name  = local.manifest.neon.databases.auth.name
  owner = postgresql_role.auth_owner.name

  depends_on = [postgresql_grant_role.auth_owner_administration]

  lifecycle {
    prevent_destroy = true
  }
}

resource "postgresql_role" "auth_user" {
  name                      = local.manifest.neon.databases.auth.runtime_role
  login                     = true
  superuser                 = false
  create_database           = false
  create_role               = false
  inherit                   = false
  replication               = false
  bypass_row_level_security = false
  password_wo               = ephemeral.random_password.auth_user.result
  password_wo_version       = "1"

  lifecycle {
    prevent_destroy = true
  }
}

resource "postgresql_grant" "auth_public_database" {
  database    = postgresql_database.auth.name
  role        = "public"
  object_type = "database"
  privileges  = []
}

resource "postgresql_grant" "api_public_database" {
  database    = local.database_name
  role        = "public"
  object_type = "database"
  privileges  = []
}

resource "postgresql_grant" "auth_database" {
  database    = postgresql_database.auth.name
  role        = postgresql_role.auth_user.name
  object_type = "database"
  privileges  = ["CONNECT"]
}

resource "postgresql_grant" "auth_public_schema" {
  database    = postgresql_database.auth.name
  role        = "public"
  schema      = "public"
  object_type = "schema"
  privileges  = []
}

resource "postgresql_grant" "auth_schema" {
  database    = postgresql_database.auth.name
  role        = postgresql_role.auth_user.name
  schema      = "public"
  object_type = "schema"
  privileges  = ["USAGE"]
}

resource "postgresql_grant" "auth_tables" {
  database    = postgresql_database.auth.name
  role        = postgresql_role.auth_user.name
  schema      = "public"
  object_type = "table"
  objects     = []
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

resource "postgresql_grant" "auth_sequences" {
  database    = postgresql_database.auth.name
  role        = postgresql_role.auth_user.name
  schema      = "public"
  object_type = "sequence"
  objects     = []
  privileges  = ["USAGE", "SELECT", "UPDATE"]
}

resource "postgresql_default_privileges" "auth_objects" {
  for_each = {
    table    = ["SELECT", "INSERT", "UPDATE", "DELETE"]
    sequence = ["USAGE", "SELECT", "UPDATE"]
    type     = ["USAGE"]
  }
  database    = postgresql_database.auth.name
  role        = postgresql_role.auth_user.name
  owner       = postgresql_role.auth_owner.name
  schema      = "public"
  object_type = each.key
  privileges  = each.value
}

resource "infisical_secret" "auth_owner_direct_url" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/auth/deployment"
  name             = "DATABASE_OWNER_DIRECT_URL"
  value_wo         = "postgresql://${postgresql_role.auth_owner.name}:${ephemeral.random_password.auth_owner.result}@${ephemeral.infisical_secret.database_owner_host.value}:5432/${postgresql_database.auth.name}?sslmode=require"
  value_wo_version = 1
}

resource "infisical_secret" "hyperdrive_origin_host" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/opentofu/cloudflare-hyperdrive"
  name             = "DATABASE_HOST"
  value_wo         = ephemeral.infisical_secret.database_owner_host.value
  value_wo_version = 1
}

resource "infisical_secret" "hyperdrive_origin_password" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/opentofu/cloudflare-hyperdrive"
  name             = "DATABASE_PASSWORD"
  value_wo         = ephemeral.random_password.auth_user.result
  value_wo_version = 1
  depends_on       = [postgresql_role.auth_user]
}
