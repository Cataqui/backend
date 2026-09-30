mock_provider "datadog" {
  mock_resource "datadog_api_key" {
    defaults = {
      key = "mock-datadog-api-key"
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

run "staging_key" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = datadog_api_key.api_runtime.name == "cataqui-api-staging"
    error_message = "Staging must use its own named Datadog API key."
  }
}

run "production_key" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = datadog_api_key.api_runtime.name == "cataqui-api-production"
    error_message = "Production must use its own named Datadog API key."
  }
}

run "runtime_secret_delivery" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.datadog_api_key.workspace_id == module.infisical_project.id &&
      infisical_secret.datadog_api_key.env_slug == "production" &&
      infisical_secret.datadog_api_key.folder_path == "/generated/api/runtime" &&
      infisical_secret.datadog_api_key.name == "DATADOG_API_KEY" &&
      infisical_secret.datadog_api_key.value_wo_version == 1
    )
    error_message = "The Datadog API key must reach the API runtime folder of the matching environment as DATADOG_API_KEY."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
