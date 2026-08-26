mock_provider "neon" {}

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

run "staging_project_key" {
  command = plan

  variables {
    environment     = "staging"
    neon_project_id = "mock-staging-project"
  }

  assert {
    condition = (
      neon_org_api_key.project_access.name == "cataqui-backend-project-access-staging" &&
      neon_org_api_key.project_access.org_id == "org-wandering-pond-46567045" &&
      neon_org_api_key.project_access.project_id == "mock-staging-project"
    )
    error_message = "Staging must create the exact project-scoped Neon API key."
  }

  assert {
    condition = (
      infisical_secret.neon_project_api_key.workspace_id == module.infisical_project.id &&
      infisical_secret.neon_project_api_key.env_slug == "staging" &&
      infisical_secret.neon_project_api_key.folder_path == "/generated/api/deployment" &&
      infisical_secret.neon_project_api_key.name == "NEON_PROJECT_API_KEY" &&
      infisical_secret.neon_project_api_key.value_wo_version == 1
    )
    error_message = "Staging must deliver the project key write-only to API deployment secrets."
  }
}

run "production_project_key" {
  command = plan

  variables {
    environment     = "production"
    neon_project_id = "mock-production-project"
  }

  assert {
    condition = (
      neon_org_api_key.project_access.name == "cataqui-backend-project-access-production" &&
      neon_org_api_key.project_access.project_id == "mock-production-project" &&
      infisical_secret.neon_project_api_key.env_slug == "production"
    )
    error_message = "Production must use its isolated project and secret environment."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment     = "development"
    neon_project_id = "mock-development-project"
  }

  expect_failures = [var.environment]
}

run "reject_invalid_project_id" {
  command = plan

  variables {
    environment     = "staging"
    neon_project_id = "INVALID"
  }

  expect_failures = [var.neon_project_id]
}
