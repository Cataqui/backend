mock_provider "google" {
  mock_resource "google_apikeys_key" {
    defaults = {
      key_string = "mock-google-places-key"
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

run "staging_maps_platform" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-staging"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      google_apikeys_key.maps_places.name == "cataqui-maps-places-staging" &&
      google_apikeys_key.maps_places.project == "cataqui-staging"
    )
    error_message = "Staging must create its Maps Places key in the matching Google Cloud project."
  }
}

run "production_maps_platform" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      google_apikeys_key.maps_places.name == "cataqui-maps-places-production" &&
      google_apikeys_key.maps_places.project == "cataqui"
    )
    error_message = "Production must create its Maps Places key in the matching Google Cloud project."
  }
}

run "maps_services_and_places_restriction" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-staging"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      toset(keys(google_project_service.maps_platform)) == toset([
        "apikeys.googleapis.com",
        "places.googleapis.com",
      ]) &&
      alltrue([for service in google_project_service.maps_platform : service.project == "cataqui-staging" && !service.disable_on_destroy])
    )
    error_message = "The root must enable only the approved Maps Platform services without disabling them during state removal."
  }

  assert {
    condition = (
      length(google_apikeys_key.maps_places.restrictions) == 1 &&
      length(google_apikeys_key.maps_places.restrictions[0].api_targets) == 1 &&
      google_apikeys_key.maps_places.restrictions[0].api_targets[0].service == "places.googleapis.com"
    )
    error_message = "The generated server key must be restricted exclusively to Places API (New)."
  }


}

run "key_destruction_protection" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = alltrue([
      for key in [
        google_apikeys_key.maps_places,
      ] : key.deletion_policy == "PREVENT"
    ])
    error_message = "Every generated API key must reject provider-side deletion."
  }
}

run "runtime_secret_delivery" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.google_places_api_key.workspace_id == module.infisical_project.id &&
      infisical_secret.google_places_api_key.env_slug == "production" &&
      infisical_secret.google_places_api_key.folder_path == "/generated/maps/runtime" &&
      infisical_secret.google_places_api_key.name == "GOOGLE_PLACES_API_KEY" &&
      infisical_secret.google_places_api_key.value_wo_version == 1
    )
    error_message = "The Places key must be written only to the matching backend runtime folder through the write-only field."
  }
}

run "reject_unsupported_environment" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-development"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
