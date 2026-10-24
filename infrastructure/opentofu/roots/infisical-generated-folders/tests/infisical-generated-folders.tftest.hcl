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
      infisical_secret_folder.ai.folder_path == "/generated" &&
      infisical_secret_folder.ai.name == "ai" &&
      !infisical_secret_folder.ai.force_delete &&
      infisical_secret_folder.ai_deployment.folder_path == "/generated/ai" &&
      infisical_secret_folder.ai_deployment.name == "deployment" &&
      !infisical_secret_folder.ai_deployment.force_delete &&
      infisical_secret_folder.api.folder_path == "/generated" &&
      infisical_secret_folder.api.name == "api" &&
      !infisical_secret_folder.api.force_delete &&
      infisical_secret_folder.mapshot.folder_path == "/generated" &&
      infisical_secret_folder.mapshot.name == "mapshot" &&
      !infisical_secret_folder.mapshot.force_delete &&
      infisical_secret_folder.mapshot_deployment.folder_path == "/generated/mapshot" &&
      infisical_secret_folder.mapshot_deployment.name == "deployment" &&
      !infisical_secret_folder.mapshot_deployment.force_delete &&
      infisical_secret_folder.maps.folder_path == "/generated" &&
      infisical_secret_folder.maps.name == "maps" &&
      !infisical_secret_folder.maps.force_delete &&
      infisical_secret_folder.auth.folder_path == "/generated" &&
      infisical_secret_folder.auth.name == "auth" &&
      !infisical_secret_folder.auth.force_delete &&
      infisical_secret_folder.api_runtime.folder_path == "/generated/api" &&
      infisical_secret_folder.api_runtime.name == "runtime" &&
      !infisical_secret_folder.api_runtime.force_delete &&
      infisical_secret_folder.auth_runtime.folder_path == "/generated/auth" &&
      infisical_secret_folder.auth_runtime.name == "runtime" &&
      !infisical_secret_folder.auth_runtime.force_delete &&
      infisical_secret_folder.deployment.folder_path == "/generated/api" &&
      infisical_secret_folder.deployment.name == "deployment" &&
      !infisical_secret_folder.deployment.force_delete &&
      infisical_secret_folder.maps_runtime.folder_path == "/generated/maps" &&
      infisical_secret_folder.maps_runtime.name == "runtime" &&
      !infisical_secret_folder.maps_runtime.force_delete &&
      infisical_secret_folder.maps_deployment.folder_path == "/generated/maps" &&
      infisical_secret_folder.maps_deployment.name == "deployment" &&
      !infisical_secret_folder.maps_deployment.force_delete &&
      infisical_secret_folder.auth_deployment.folder_path == "/generated/auth" &&
      infisical_secret_folder.auth_deployment.name == "deployment" &&
      !infisical_secret_folder.auth_deployment.force_delete
    )
    error_message = "Applications must have protected folders for their current deployment and runtime credential needs."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.folder_path == "/generated" &&
      infisical_secret_folder.opentofu.name == "opentofu" &&
      !infisical_secret_folder.opentofu.force_delete &&
      toset(keys(infisical_secret_folder.cloudflare_opentofu_root)) == toset([
        "cloudflare-ai-gateways",
        "cloudflare-hyperdrive",
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
      infisical_secret_folder.ai.environment_slug == "production" &&
      infisical_secret_folder.ai_deployment.environment_slug == "production" &&
      infisical_secret_folder.api.environment_slug == "production" &&
      infisical_secret_folder.maps_runtime.environment_slug == "production" &&
      infisical_secret_folder.mapshot.environment_slug == "production" &&
      infisical_secret_folder.mapshot_deployment.environment_slug == "production" &&
      infisical_secret_folder.maps.environment_slug == "production" &&
      infisical_secret_folder.maps_deployment.environment_slug == "production" &&
      infisical_secret_folder.auth.environment_slug == "production" &&
      infisical_secret_folder.api_runtime.environment_slug == "production" &&
      infisical_secret_folder.auth_runtime.environment_slug == "production" &&
      infisical_secret_folder.deployment.environment_slug == "production" &&
      infisical_secret_folder.auth_deployment.environment_slug == "production"
    )
    error_message = "Every folder must use the selected Infisical environment."
  }

  assert {
    condition = (
      infisical_secret_folder.opentofu.environment_slug == "production" &&
      length(infisical_secret_folder.cloudflare_opentofu_root) == 7 &&
      alltrue([for folder in values(infisical_secret_folder.cloudflare_opentofu_root) : folder.environment_slug == "production"])
    )
    error_message = "Production must create one credential folder for each of its seven Cloudflare roots."
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

run "mapshot_staging_pipeline_folders" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      toset(keys(infisical_secret_folder.mapshot_pipeline)) == toset(["map-update"]) &&
      alltrue([
        for name, folder in infisical_secret_folder.mapshot_pipeline :
        folder.name == name && folder.folder_path == "/generated/mapshot" && folder.environment_slug == "staging" && !folder.force_delete
      ])
    )
    error_message = "Staging must own protected map-update folder without production promotion credentials."
  }
}

run "mapshot_production_pipeline_folders" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      length(infisical_secret_folder.mapshot_pipeline) == 0 &&
      alltrue([
        for name, folder in infisical_secret_folder.mapshot_pipeline :
        folder.name == name && folder.folder_path == "/generated/mapshot" && folder.environment_slug == "production" && !folder.force_delete
      ])
    )
    error_message = "Production must reuse its deployment folder without a separate promotion or map-update folder."
  }
}
