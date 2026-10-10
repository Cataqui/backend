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
      infisical_secret_folder.maps.folder_path == "/generated" &&
      infisical_secret_folder.maps.name == "maps" &&
      !infisical_secret_folder.maps.force_delete &&
      infisical_secret_folder.webhooks.folder_path == "/generated" &&
      infisical_secret_folder.webhooks.name == "webhooks" &&
      !infisical_secret_folder.webhooks.force_delete &&
      infisical_secret_folder.api_runtime.folder_path == "/generated/api" &&
      infisical_secret_folder.api_runtime.name == "runtime" &&
      !infisical_secret_folder.api_runtime.force_delete &&
      infisical_secret_folder.webhooks_runtime.folder_path == "/generated/webhooks" &&
      infisical_secret_folder.webhooks_runtime.name == "runtime" &&
      !infisical_secret_folder.webhooks_runtime.force_delete &&
      infisical_secret_folder.deployment.folder_path == "/generated/api" &&
      infisical_secret_folder.deployment.name == "deployment" &&
      !infisical_secret_folder.deployment.force_delete &&
      infisical_secret_folder.maps_runtime.folder_path == "/generated/maps" &&
      infisical_secret_folder.maps_runtime.name == "runtime" &&
      !infisical_secret_folder.maps_runtime.force_delete &&
      infisical_secret_folder.maps_deployment.folder_path == "/generated/maps" &&
      infisical_secret_folder.maps_deployment.name == "deployment" &&
      !infisical_secret_folder.maps_deployment.force_delete &&
      infisical_secret_folder.webhooks_deployment.folder_path == "/generated/webhooks" &&
      infisical_secret_folder.webhooks_deployment.name == "deployment" &&
      !infisical_secret_folder.webhooks_deployment.force_delete
    )
    error_message = "API, Maps, and Webhooks must each have protected runtime and deployment folders."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.folder_path == "/generated" &&
      infisical_secret_folder.opentofu.name == "opentofu" &&
      !infisical_secret_folder.opentofu.force_delete &&
      toset(keys(infisical_secret_folder.cloudflare_opentofu_root)) == toset([
        "cloudflare-ai-gateways",
        "cloudflare-pages",
        "cloudflare-queues",
        "cloudflare-r2",
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
      infisical_secret_folder.maps_runtime.environment_slug == "production" &&
      infisical_secret_folder.maps.environment_slug == "production" &&
      infisical_secret_folder.maps_deployment.environment_slug == "production" &&
      infisical_secret_folder.webhooks.environment_slug == "production" &&
      infisical_secret_folder.api_runtime.environment_slug == "production" &&
      infisical_secret_folder.webhooks_runtime.environment_slug == "production" &&
      infisical_secret_folder.deployment.environment_slug == "production" &&
      infisical_secret_folder.webhooks_deployment.environment_slug == "production"
    )
    error_message = "Every folder must use the selected Infisical environment."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.environment_slug == "production" &&
      length(infisical_secret_folder.cloudflare_opentofu_root) == 6 &&
      alltrue([for folder in values(infisical_secret_folder.cloudflare_opentofu_root) : folder.environment_slug == "production"])
    )
    error_message = "Production must create one credential folder for each of its six Cloudflare roots."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

run "r2_credential_folder" {
  command = plan
  variables {
    environment = "production"
  }
  assert {
    condition = (
      infisical_secret_folder.cloudflare_opentofu_root["cloudflare-r2"].folder_path == "/generated/opentofu" &&
      infisical_secret_folder.cloudflare_opentofu_root["cloudflare-r2"].name == "cloudflare-r2" &&
      infisical_secret_folder.cloudflare_opentofu_root["cloudflare-r2"].environment_slug == "production" &&
      !infisical_secret_folder.cloudflare_opentofu_root["cloudflare-r2"].force_delete
    )
    error_message = "R2 credentials must have a protected environment-scoped generated folder."
  }
}
