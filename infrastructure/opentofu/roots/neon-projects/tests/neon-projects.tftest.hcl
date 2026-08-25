mock_provider "neon" {
  mock_resource "neon_project" {
    defaults = {
      connection_uri       = "postgresql://db_owner:password@ep-direct/cataqui"
      database_host        = "ep-direct"
      database_host_pooler = "ep-pooler"
      database_name        = "cataqui"
      database_password    = "password"
      database_user        = "db_owner"
    }
  }
}

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

run "staging_project" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      neon_project.cataqui.name == "cataqui-staging" &&
      neon_project.cataqui.org_id == "org-wandering-pond-46567045" &&
      neon_project.cataqui.region_id == "aws-sa-east-1" &&
      neon_project.cataqui.pg_version == 18 &&
      neon_project.cataqui.history_retention_seconds == 86400
    )
    error_message = "Staging must use the approved project identity, region, Postgres version, and one-day PITR."
  }

  assert {
    condition = (
      neon_project.cataqui.default_endpoint_settings[0].autoscaling_limit_min_cu == 0.25 &&
      neon_project.cataqui.default_endpoint_settings[0].autoscaling_limit_max_cu == 1 &&
      neon_project.cataqui.default_endpoint_settings[0].suspend_timeout_seconds == 300 &&
      neon_project.cataqui.maintenance_window[0].weekdays == tolist([6])
    )
    error_message = "Staging must keep the cost-first compute and Saturday maintenance profile."
  }
}

run "production_project" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      neon_project.cataqui.name == "cataqui-production" &&
      neon_project.cataqui.history_retention_seconds == 604800 &&
      neon_project.cataqui.default_endpoint_settings[0].autoscaling_limit_min_cu == 0.25 &&
      neon_project.cataqui.default_endpoint_settings[0].autoscaling_limit_max_cu == 2 &&
      neon_project.cataqui.default_endpoint_settings[0].suspend_timeout_seconds == 300 &&
      neon_project.cataqui.maintenance_window[0].weekdays == tolist([7])
    )
    error_message = "Production must keep the cost-first compute, seven-day PITR, and Sunday maintenance profile."
  }
}

run "project_security_and_identity" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      neon_project.cataqui.default_branch_protected &&
      neon_project.cataqui.enable_logical_replication == "no" &&
      neon_project.cataqui.store_password == "yes" &&
      neon_project.cataqui.branch[0].name == "main" &&
      neon_project.cataqui.branch[0].database_name == "cataqui" &&
      neon_project.cataqui.branch[0].role_name == "db_owner" &&
      neon_project.cataqui.maintenance_window[0].start_time == "06:00" &&
      neon_project.cataqui.maintenance_window[0].end_time == "07:00"
    )
    error_message = "Projects must protect the main branch and use the approved database, owner, privacy, and maintenance settings."
  }
}

run "deployment_secret_delivery" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = alltrue([
      for secret in [
        infisical_secret.database_owner_direct_url,
        infisical_secret.database_owner_host,
        infisical_secret.database_owner_password,
        infisical_secret.database_pooler_host,
      ] : secret.workspace_id == module.infisical_project.id && secret.env_slug == "staging" && secret.folder_path == "/generated/api/deployment" && secret.value_wo_version == 1
    ])
    error_message = "Every Neon-generated deployment value must use the matching Infisical deployment folder and write-only version."
  }

  assert {
    condition = toset([
      infisical_secret.database_owner_direct_url.name,
      infisical_secret.database_owner_host.name,
      infisical_secret.database_owner_password.name,
      infisical_secret.database_pooler_host.name,
      ]) == toset([
      "DATABASE_OWNER_DIRECT_URL",
      "DATABASE_OWNER_HOST",
      "DATABASE_OWNER_PASSWORD",
      "DATABASE_POOLER_HOST",
    ])
    error_message = "The project root must publish exactly the approved deployment values."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
