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
mock_provider "random" {}

run "staging_auth_keys" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      ephemeral.random_bytes.refresh_token_hmac_v1.length == 32 &&
      ephemeral.random_bytes.whatsapp_webhook_verify_token.length == 32 &&
      ephemeral.random_bytes.static_map_signing.length == 32
    )
    error_message = "Authentication secrets must use 32-byte random values."
  }

  assert {
    condition = (
      infisical_secret.auth_refresh_token_hmac.workspace_id == module.infisical_project.id &&
      infisical_secret.auth_refresh_token_hmac.env_slug == "staging" &&
      infisical_secret.auth_refresh_token_hmac.folder_path == "/generated/auth/runtime" &&
      infisical_secret.auth_refresh_token_hmac.name == "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL" &&
      infisical_secret.auth_refresh_token_hmac.value_wo_version == 1
    )
    error_message = "The staging refresh-token HMAC key must be delivered to the matching Auth runtime folder."
  }

  assert {
    condition = (
      infisical_secret.auth_whatsapp_webhook_verify_token.env_slug == "staging" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.folder_path == "/generated/auth/runtime" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.name == "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.value_wo_version == 1 &&
      infisical_secret.static_map_signing_key.env_slug == "staging" &&
      infisical_secret.static_map_signing_key.folder_path == "/generated/maps/runtime" &&
      infisical_secret.static_map_signing_key.name == "STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL" &&
      infisical_secret.static_map_signing_key.value_wo_version == 1
    )
    error_message = "Every staging authentication secret must be delivered to its matching runtime folder."
  }
}

run "production_auth_keys" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.auth_whatsapp_webhook_verify_token.workspace_id == module.infisical_project.id &&
      infisical_secret.auth_whatsapp_webhook_verify_token.env_slug == "production" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.folder_path == "/generated/auth/runtime" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.name == "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN" &&
      infisical_secret.auth_whatsapp_webhook_verify_token.value_wo_version == 1 &&
      infisical_secret.static_map_signing_key.env_slug == "production" &&
      infisical_secret.static_map_signing_key.folder_path == "/generated/maps/runtime" &&
      infisical_secret.static_map_signing_key.name == "STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL" &&
      infisical_secret.static_map_signing_key.value_wo_version == 1
    )
    error_message = "The production WhatsApp webhook verification token must be delivered to the matching Auth runtime folder."
  }

  assert {
    condition = (
      infisical_secret.auth_refresh_token_hmac.env_slug == "production" &&
      infisical_secret.auth_refresh_token_hmac.folder_path == "/generated/auth/runtime" &&
      infisical_secret.auth_refresh_token_hmac.name == "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL" &&
      infisical_secret.auth_refresh_token_hmac.value_wo_version == 1
    )
    error_message = "The production refresh-token HMAC key must be delivered to the matching Auth runtime folder."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
