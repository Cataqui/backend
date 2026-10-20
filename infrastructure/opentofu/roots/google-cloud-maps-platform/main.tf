resource "google_project_service" "maps_platform" {
  for_each = local.maps_platform_services

  project            = local.google_cloud_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_apikeys_key" "maps_places" {
  # The provider name is immutable; retain the existing key identity.
  name            = "cataqui-geosearch-places-${var.environment}"
  display_name    = "Cataqui Maps Places ${title(var.environment)}"
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

resource "infisical_secret" "google_places_api_key" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/maps/runtime"
  name             = "GOOGLE_PLACES_API_KEY"
  value_wo         = google_apikeys_key.maps_places.key_string
  value_wo_version = 1
}
