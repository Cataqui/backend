mock_provider "google" {
  mock_resource "google_apikeys_key" {
    defaults = {
      key_string = "mock-google-places-key"
    }
  }
}

mock_provider "infisical" {}

run "staging_maps_platform" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-staging-a1b2c3"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      google_apikeys_key.geosearch_places.name == "cataqui-geosearch-places-staging" &&
      google_apikeys_key.geosearch_places.project == "cataqui-staging-a1b2c3" &&
      google_apikeys_key.mobile_maps_android.name == "cataqui-mobile-maps-android-staging" &&
      google_apikeys_key.mobile_maps_android.project == "cataqui-staging-a1b2c3" &&
      google_apikeys_key.mobile_maps_ios.name == "cataqui-mobile-maps-ios-staging" &&
      google_apikeys_key.mobile_maps_ios.project == "cataqui-staging-a1b2c3"
    )
    error_message = "Staging must create its Geosearch, Android, and iOS keys in the matching Google Cloud project."
  }
}

run "production_maps_platform" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-production-a1b2c3"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      google_apikeys_key.geosearch_places.name == "cataqui-geosearch-places-production" &&
      google_apikeys_key.geosearch_places.project == "cataqui-production-a1b2c3" &&
      google_apikeys_key.mobile_maps_android.name == "cataqui-mobile-maps-android-production" &&
      google_apikeys_key.mobile_maps_android.project == "cataqui-production-a1b2c3" &&
      google_apikeys_key.mobile_maps_ios.name == "cataqui-mobile-maps-ios-production" &&
      google_apikeys_key.mobile_maps_ios.project == "cataqui-production-a1b2c3"
    )
    error_message = "Production must create its Geosearch, Android, and iOS keys in the matching Google Cloud project."
  }
}

run "maps_services_and_places_restriction" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-staging-a1b2c3"
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
        "maps-android-backend.googleapis.com",
        "maps-ios-backend.googleapis.com",
        "places.googleapis.com",
      ]) &&
      alltrue([for service in google_project_service.maps_platform : service.project == "cataqui-staging-a1b2c3" && !service.disable_on_destroy])
    )
    error_message = "The root must enable only the approved Maps Platform services without disabling them during state removal."
  }

  assert {
    condition = (
      length(google_apikeys_key.geosearch_places.restrictions) == 1 &&
      length(google_apikeys_key.geosearch_places.restrictions[0].api_targets) == 1 &&
      google_apikeys_key.geosearch_places.restrictions[0].api_targets[0].service == "places.googleapis.com"
    )
    error_message = "The generated server key must be restricted exclusively to Places API (New)."
  }

  assert {
    condition = (
      length(google_apikeys_key.mobile_maps_android.restrictions) == 1 &&
      length(google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions) == 1 &&
      length(google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions[0].allowed_applications) == 1 &&
      google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions[0].allowed_applications[0].package_name == "com.cataqui.mobile.development" &&
      google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions[0].allowed_applications[0].sha1_fingerprint == "82a43cc0d04bdf3ed47d549c0ad2f2a8fffac323" &&
      length(google_apikeys_key.mobile_maps_android.restrictions[0].api_targets) == 1 &&
      google_apikeys_key.mobile_maps_android.restrictions[0].api_targets[0].service == "maps-android-backend.googleapis.com"
    )
    error_message = "The staging Android key must authorize only the development package and its normalized debug certificate for Maps SDK for Android."
  }

  assert {
    condition = (
      length(google_apikeys_key.mobile_maps_ios.restrictions) == 1 &&
      length(google_apikeys_key.mobile_maps_ios.restrictions[0].ios_key_restrictions) == 1 &&
      length(google_apikeys_key.mobile_maps_ios.restrictions[0].ios_key_restrictions[0].allowed_bundle_ids) == 1 &&
      google_apikeys_key.mobile_maps_ios.restrictions[0].ios_key_restrictions[0].allowed_bundle_ids[0] == "com.cataqui.mobile.development" &&
      length(google_apikeys_key.mobile_maps_ios.restrictions[0].api_targets) == 1 &&
      google_apikeys_key.mobile_maps_ios.restrictions[0].api_targets[0].service == "maps-ios-backend.googleapis.com"
    )
    error_message = "The staging iOS key must authorize only the development bundle for Maps SDK for iOS."
  }
}

run "production_mobile_restrictions" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-production-a1b2c3"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      toset([
        for application in google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions[0].allowed_applications : application.package_name
      ]) == toset(["com.cataqui.mobile"]) &&
      toset([
        for application in google_apikeys_key.mobile_maps_android.restrictions[0].android_key_restrictions[0].allowed_applications : application.sha1_fingerprint
        ]) == toset([
        "f7237fbaf47d92fd2207c2b7d913125981c53e5e",
        "c8145dd5ef25984b8ad9e54d1d1af49803d91b75",
        "18739749e9979ab437d6e48e85af9d952d90cdb3",
      ]) &&
      length(google_apikeys_key.mobile_maps_ios.restrictions[0].ios_key_restrictions[0].allowed_bundle_ids) == 1 &&
      google_apikeys_key.mobile_maps_ios.restrictions[0].ios_key_restrictions[0].allowed_bundle_ids[0] == "com.cataqui.mobile"
    )
    error_message = "Production mobile keys must authorize the production identities and every Play app-signing certificate."
  }
}

run "key_destruction_protection" {
  command = plan

  override_data {
    target = data.terraform_remote_state.google_cloud_projects
    values = {
      outputs = {
        project_id     = "cataqui-production-a1b2c3"
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
        google_apikeys_key.geosearch_places,
        google_apikeys_key.mobile_maps_android,
        google_apikeys_key.mobile_maps_ios,
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
        project_id     = "cataqui-production-a1b2c3"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.google_places_api_key.workspace_id == "954d434f-7e08-4904-af66-0bf62377794e" &&
      infisical_secret.google_places_api_key.env_slug == "production" &&
      infisical_secret.google_places_api_key.folder_path == "/generated/geosearch/runtime" &&
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
        project_id     = "cataqui-development-a1b2c3"
        project_number = "123456789012"
      }
    }
  }

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
