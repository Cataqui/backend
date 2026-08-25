ephemeral "random_bytes" "refresh_token_hmac_v1" {
  length = 32
}

ephemeral "random_bytes" "whatsapp_webhook_verify_token" {
  length = 32
}

ephemeral "tls_private_key" "microservices_auth_jwt_v1" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "infisical_secret" "refresh_token_hmac_key_v1" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL"
  value_wo         = local.refresh_token_hmac_key_base64url
  value_wo_version = local.refresh_token_hmac_key_version

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "microservices_auth_jwt_private_key_v1" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64"
  value_wo         = local.microservices_auth_jwt_private_key_pkcs8_base64
  value_wo_version = local.microservices_auth_jwt_key_version

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "whatsapp_webhook_verify_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/webhooks/runtime"
  name             = "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN"
  value_wo         = local.whatsapp_webhook_verify_token_base64url
  value_wo_version = local.whatsapp_webhook_verify_token_version

  lifecycle {
    prevent_destroy = true
  }
}
