mock_provider "infisical" {
  mock_data "infisical_projects" {
    defaults = {
      id     = "mock-project-id"
      name   = "Cataquí Backend"
      org_id = "33687647-d8e9-44a7-9cb9-721bd5b28a45"
      type   = "secret-manager"
      environments = {
        staging    = { id = "staging-id", name = "Staging", slug = "staging" }
        production = { id = "production-id", name = "Production", slug = "production" }
      }
    }
  }
}
mock_provider "postgresql" {}
mock_provider "random" {}

run "least_privilege_runtime_role" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      postgresql_role.db_user.name == "db_user" &&
      postgresql_role.db_user.login &&
      postgresql_role.db_user.inherit &&
      !postgresql_role.db_user.superuser &&
      !postgresql_role.db_user.create_database &&
      !postgresql_role.db_user.create_role &&
      !postgresql_role.db_user.replication &&
      !postgresql_role.db_user.bypass_row_level_security &&
      postgresql_role.db_user.connection_limit == -1 &&
      postgresql_role.db_user.encrypted_password &&
      postgresql_role.db_user.password_wo_version == "1"
    )
    error_message = "The API role must remain a login-only least-privilege database role."
  }
}

run "current_object_grants" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      postgresql_grant.database.object_type == "database" &&
      postgresql_grant.database.privileges == toset(["CONNECT"]) &&
      postgresql_grant.schema.object_type == "schema" &&
      postgresql_grant.schema.schema == "public" &&
      postgresql_grant.schema.privileges == toset(["USAGE"]) &&
      length(postgresql_grant.tables.objects) == 0 &&
      postgresql_grant.tables.privileges == toset(["SELECT", "INSERT", "UPDATE", "DELETE"]) &&
      length(postgresql_grant.sequences.objects) == 0 &&
      postgresql_grant.sequences.privileges == toset(["USAGE", "SELECT", "UPDATE"])
    )
    error_message = "The API role must receive only the required existing database, schema, table, and sequence privileges."
  }
}

run "future_object_grants" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      postgresql_default_privileges.tables.owner == "db_owner" &&
      postgresql_default_privileges.tables.object_type == "table" &&
      postgresql_default_privileges.tables.privileges == toset(["SELECT", "INSERT", "UPDATE", "DELETE"]) &&
      postgresql_default_privileges.sequences.owner == "db_owner" &&
      postgresql_default_privileges.sequences.object_type == "sequence" &&
      postgresql_default_privileges.sequences.privileges == toset(["USAGE", "SELECT", "UPDATE"]) &&
      postgresql_default_privileges.types.owner == "db_owner" &&
      postgresql_default_privileges.types.object_type == "type" &&
      postgresql_default_privileges.types.privileges == toset(["USAGE"])
    )
    error_message = "Objects created by db_owner must retain the approved runtime default privileges."
  }
}

run "runtime_secret_delivery" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.database_app_pooler_url.workspace_id == module.infisical_project.id &&
      infisical_secret.database_app_pooler_url.env_slug == "production" &&
      infisical_secret.database_app_pooler_url.folder_path == "/generated/api/runtime" &&
      infisical_secret.database_app_pooler_url.name == "DATABASE_APP_POOLER_URL" &&
      infisical_secret.database_app_pooler_url.value_wo_version == 1
    )
    error_message = "The pooled runtime URL must be written only to the matching runtime folder."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

run "auth_database_boundary" {
  command = plan
  variables { environment = "production" }
  assert {
    condition = (
      postgresql_database.auth.name == "auth" &&
      postgresql_database.auth.owner == "auth_owner" &&
      postgresql_role.auth_user.name == "auth_user" &&
      !postgresql_role.auth_user.inherit &&
      !postgresql_role.auth_user.superuser &&
      !postgresql_role.auth_user.create_database &&
      !postgresql_role.auth_user.create_role &&
      !postgresql_role.auth_user.bypass_row_level_security &&
      length(postgresql_grant.auth_public_database.privileges) == 0 &&
      length(postgresql_grant.api_public_database.privileges) == 0 &&
      postgresql_grant.auth_database.privileges == toset(["CONNECT"]) &&
      postgresql_grant.auth_schema.privileges == toset(["USAGE"]) &&
      postgresql_default_privileges.auth_objects["table"].owner == "auth_owner" &&
      postgresql_default_privileges.auth_objects["table"].role == "auth_user"
    )
    error_message = "Auth must have its own database and isolated migration/runtime roles without PUBLIC cross-database access."
  }
  assert {
    condition = (
      infisical_secret.auth_owner_direct_url.folder_path == "/generated/auth/deployment" &&
      infisical_secret.hyperdrive_origin_password.folder_path == "/generated/opentofu/cloudflare-hyperdrive" &&
      infisical_secret.hyperdrive_origin_password.name == "DATABASE_PASSWORD"
    )
    error_message = "Auth migration and Hyperdrive origin credentials must stay outside runtime secrets."
  }
}
