mock_provider "neon" {}

override_resource {
  target          = neon_project.database
  override_during = plan
  values = {
    id                    = "project-id"
    default_branch_id     = "branch-id"
    connection_uri        = "postgresql://owner:password@direct.example/cataqui"
    connection_uri_pooler = "postgresql://owner:password@pooler.example/cataqui"
    database_user         = "owner"
  }
}

run "staging_uses_the_recommended_free_plan_configuration" {
  command = plan

  variables {
    environment          = "staging"
    neon_organization_id = "org-cataqui"
  }

  assert {
    condition = (
      neon_project.database.name == "cataqui-api-staging" &&
      neon_project.database.branch[0].name == "staging" &&
      neon_project.database.branch[0].database_name == "cataqui-staging" &&
      neon_project.database.branch[0].role_name == "cataqui_staging_owner" &&
      neon_role.app.name == "cataqui_staging_app"
    )
    error_message = "Staging must use its independent Cataquí project, branch, database, and owner."
  }
}

run "production_uses_the_recommended_free_plan_configuration" {
  command = plan

  variables {
    environment          = "production"
    neon_organization_id = "org-cataqui"
  }

  assert {
    condition = (
      neon_project.database.name == "cataqui-api-production" &&
      neon_project.database.branch[0].name == "production" &&
      neon_project.database.branch[0].database_name == "cataqui-production" &&
      neon_project.database.branch[0].role_name == "cataqui_production_owner" &&
      neon_role.app.name == "cataqui_production_app"
    )
    error_message = "Production must use its independent Cataquí project, branch, database, and owner."
  }
}

run "every_environment_uses_free_plan_compute_and_restore_limits" {
  command = plan

  variables {
    environment          = "production"
    neon_organization_id = "org-cataqui"
  }

  assert {
    condition = (
      neon_project.database.region_id == "aws-sa-east-1" &&
      neon_project.database.pg_version == 18 &&
      neon_project.database.default_endpoint_settings[0].autoscaling_limit_min_cu == 0.25 &&
      neon_project.database.default_endpoint_settings[0].autoscaling_limit_max_cu == 2 &&
      neon_project.database.default_endpoint_settings[0].suspend_timeout_seconds == 300 &&
      neon_project.database.history_retention_seconds == 21600 &&
      neon_project.database.enable_logical_replication == "no"
    )
    error_message = "Every project must stay within the recommended Neon Free plan configuration."
  }
}

run "development_is_rejected_as_a_managed_environment" {
  command = plan

  variables {
    environment          = "development"
    neon_organization_id = "org-cataqui"
  }

  expect_failures = [var.environment]
}

run "malformed_organization_identifiers_are_rejected_before_infrastructure_is_planned" {
  command = plan

  variables {
    environment          = "staging"
    neon_organization_id = "cataqui"
  }

  expect_failures = [var.neon_organization_id]
}
