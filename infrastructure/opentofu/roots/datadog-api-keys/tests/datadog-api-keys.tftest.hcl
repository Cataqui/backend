mock_provider "datadog" {
  mock_resource "datadog_api_key" {
    defaults = {
      key = "mock-datadog-api-key"
    }
  }

  mock_resource "datadog_service_account_application_key" {
    defaults = {
      key = "mock-datadog-application-key"
    }
  }

  mock_data "datadog_service_account" {
    defaults = {
      id       = "mock-service-account-id"
      email    = "cataqui-backend-opentofu@cataqui.com"
      disabled = false
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

run "opentofu_root_keys" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      datadog_api_key.opentofu_root["datadog-observability"].name == "cataqui-opentofu-datadog-observability-staging" &&
      datadog_service_account_application_key.opentofu_root["datadog-observability"].service_account_id == "mock-service-account-id" &&
      contains(datadog_service_account_application_key.opentofu_root["datadog-observability"].scopes, "monitors_write") &&
      !contains(datadog_service_account_application_key.opentofu_root["datadog-observability"].scopes, "api_keys_write")
    )
    error_message = "The observability root must get its own keys on the OpenTofu service account without key-management scopes."
  }

  assert {
    condition = alltrue([
      for secret in [
        infisical_secret.opentofu_root_api_key["datadog-observability"],
        infisical_secret.opentofu_root_application_key["datadog-observability"],
      ] : secret.folder_path == "/generated/opentofu/datadog-observability" && secret.env_slug == "staging" && secret.value_wo_version == 1
    ])
    error_message = "Root keys must be stored in that root's generated OpenTofu folder of the same environment."
  }

  assert {
    condition = (
      infisical_secret.opentofu_root_api_key["datadog-observability"].name == "DD_API_KEY" &&
      infisical_secret.opentofu_root_application_key["datadog-observability"].name == "DD_APP_KEY"
    )
    error_message = "Root keys must use the variable names the Datadog provider reads."
  }
}

run "reject_disabled_service_account" {
  command = plan

  variables {
    environment = "staging"
  }

  override_data {
    target = data.datadog_service_account.opentofu
    values = {
      id       = "mock-service-account-id"
      email    = "cataqui-backend-opentofu@cataqui.com"
      disabled = true
    }
  }

  expect_failures = [data.datadog_service_account.opentofu]
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
