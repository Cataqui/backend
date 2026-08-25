resource "google_project_service" "maps_platform" {
  for_each = local.maps_platform_services

  project            = local.google_cloud_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_apikeys_key" "geosearch_places" {
  name            = "cataqui-geosearch-places-${var.environment}"
  display_name    = "Cataqui Geosearch Places ${title(var.environment)}"
  project         = local.google_cloud_project_id
  deletion_policy = "PREVENT"

  restrictions {
    api_targets {
      service = "places.googleapis.com"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.maps_platform]
}

resource "google_apikeys_key" "mobile_maps_android" {
  name            = "cataqui-mobile-maps-android-${var.environment}"
  display_name    = "Cataqui Mobile Maps Android ${title(var.environment)}"
  project         = local.google_cloud_project_id
  deletion_policy = "PREVENT"

  restrictions {
    android_key_restrictions {
      dynamic "allowed_applications" {
        for_each = local.android_sha1_fingerprints

        content {
          package_name     = local.android_package_name
          sha1_fingerprint = allowed_applications.value
        }
      }
    }

    api_targets {
      service = "maps-android-backend.googleapis.com"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.maps_platform]
}

resource "google_apikeys_key" "mobile_maps_ios" {
  name            = "cataqui-mobile-maps-ios-${var.environment}"
  display_name    = "Cataqui Mobile Maps iOS ${title(var.environment)}"
  project         = local.google_cloud_project_id
  deletion_policy = "PREVENT"

  restrictions {
    ios_key_restrictions {
      allowed_bundle_ids = [local.ios_bundle_id]
    }

    api_targets {
      service = "maps-ios-backend.googleapis.com"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.maps_platform]
}

resource "infisical_secret" "google_places_api_key" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/geosearch/runtime"
  name             = "GOOGLE_PLACES_API_KEY"
  value_wo         = google_apikeys_key.geosearch_places.key_string
  value_wo_version = 1
}
