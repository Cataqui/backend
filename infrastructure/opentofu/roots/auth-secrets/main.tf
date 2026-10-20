ephemeral "random_bytes" "refresh_token_hmac_v1" {
  length = 32
}

ephemeral "random_bytes" "whatsapp_webhook_verify_token" {
  length = 32
}

ephemeral "random_bytes" "static_map_signing" {
  length = 32
}

resource "infisical_secret" "auth_refresh_token_hmac" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/auth/runtime"
  name             = "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"
  value_wo         = local.refresh_token_hmac_key_base64url
  value_wo_version = local.refresh_token_hmac_key_version

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "auth_whatsapp_webhook_verify_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/auth/runtime"
  name             = "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"
  value_wo         = local.whatsapp_webhook_verify_token_base64url
  value_wo_version = local.whatsapp_webhook_verify_token_version

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "static_map_signing_key" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/maps/runtime"
  name             = "STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL"
  value_wo         = local.static_map_location_signing_key_base64url
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}
