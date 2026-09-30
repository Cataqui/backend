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

run "generated_folder_contract" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      infisical_secret_folder.generated.folder_path == "/" &&
      infisical_secret_folder.generated.name == "generated" &&
      !infisical_secret_folder.generated.force_delete
    )
    error_message = "The generated folder must be a protected top-level folder."
  }

  assert {
    condition = (
      infisical_secret_folder.api.folder_path == "/generated" &&
      infisical_secret_folder.api.name == "api" &&
      !infisical_secret_folder.api.force_delete &&
      infisical_secret_folder.geosearch.folder_path == "/generated" &&
      infisical_secret_folder.geosearch.name == "geosearch" &&
      !infisical_secret_folder.geosearch.force_delete &&
      infisical_secret_folder.webhooks.folder_path == "/generated" &&
      infisical_secret_folder.webhooks.name == "webhooks" &&
      !infisical_secret_folder.webhooks.force_delete &&
      infisical_secret_folder.api_runtime.folder_path == "/generated/api" &&
      infisical_secret_folder.api_runtime.name == "runtime" &&
      !infisical_secret_folder.api_runtime.force_delete &&
      infisical_secret_folder.geosearch_runtime.folder_path == "/generated/geosearch" &&
      infisical_secret_folder.geosearch_runtime.name == "runtime" &&
      !infisical_secret_folder.geosearch_runtime.force_delete &&
      infisical_secret_folder.webhooks_runtime.folder_path == "/generated/webhooks" &&
      infisical_secret_folder.webhooks_runtime.name == "runtime" &&
      !infisical_secret_folder.webhooks_runtime.force_delete &&
      infisical_secret_folder.deployment.folder_path == "/generated/api" &&
      infisical_secret_folder.deployment.name == "deployment" &&
      !infisical_secret_folder.deployment.force_delete &&
      infisical_secret_folder.geosearch_deployment.folder_path == "/generated/geosearch" &&
      infisical_secret_folder.geosearch_deployment.name == "deployment" &&
      !infisical_secret_folder.geosearch_deployment.force_delete &&
      infisical_secret_folder.webhooks_deployment.folder_path == "/generated/webhooks" &&
      infisical_secret_folder.webhooks_deployment.name == "deployment" &&
      !infisical_secret_folder.webhooks_deployment.force_delete
    )
    error_message = "API, Geosearch, and Webhooks must each have protected runtime and deployment folders."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.folder_path == "/generated" &&
      infisical_secret_folder.opentofu.name == "opentofu" &&
      !infisical_secret_folder.opentofu.force_delete &&
      toset(keys(infisical_secret_folder.cloudflare_opentofu_root)) == toset([
        "cloudflare-ai-gateways",
        "cloudflare-queues",
      ])
    )
    error_message = "Staging must create one generated credential folder for each account-scoped Cloudflare root."
  }
}

run "production_folder_environment" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret_folder.generated.environment_slug == "production" &&
      infisical_secret_folder.api.environment_slug == "production" &&
      infisical_secret_folder.geosearch.environment_slug == "production" &&
      infisical_secret_folder.webhooks.environment_slug == "production" &&
      infisical_secret_folder.api_runtime.environment_slug == "production" &&
      infisical_secret_folder.geosearch_runtime.environment_slug == "production" &&
      infisical_secret_folder.webhooks_runtime.environment_slug == "production" &&
      infisical_secret_folder.deployment.environment_slug == "production" &&
      infisical_secret_folder.geosearch_deployment.environment_slug == "production" &&
      infisical_secret_folder.webhooks_deployment.environment_slug == "production"
    )
    error_message = "Every folder must use the selected Infisical environment."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.environment_slug == "production" &&
      length(infisical_secret_folder.cloudflare_opentofu_root) == 4 &&
      alltrue([for folder in values(infisical_secret_folder.cloudflare_opentofu_root) : folder.environment_slug == "production"])
    )
    error_message = "Production must create one credential folder for each of its four Cloudflare roots."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

run "datadog_root_folders" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      toset(keys(infisical_secret_folder.datadog_opentofu_root)) == toset(["datadog-observability"]) &&
      infisical_secret_folder.datadog_opentofu_root["datadog-observability"].folder_path == "/generated/opentofu" &&
      !infisical_secret_folder.datadog_opentofu_root["datadog-observability"].force_delete
    )
    error_message = "Every Datadog root that uses generated keys must have a protected credential folder."
  }
}
