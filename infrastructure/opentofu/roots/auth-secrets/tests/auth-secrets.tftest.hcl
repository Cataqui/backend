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
mock_provider "tls" {}

run "staging_auth_keys" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      ephemeral.random_bytes.refresh_token_hmac_v1.length == 32 &&
      ephemeral.random_bytes.whatsapp_webhook_verify_token.length == 32 &&
      ephemeral.tls_private_key.microservices_auth_jwt_v1.algorithm == "ECDSA" &&
      ephemeral.tls_private_key.microservices_auth_jwt_v1.ecdsa_curve == "P256"
    )
    error_message = "Authentication secrets must use 32-byte random values and an ES256-compatible ECDSA P-256 private key."
  }

  assert {
    condition = (
      infisical_secret.refresh_token_hmac_key_v1.workspace_id == module.infisical_project.id &&
      infisical_secret.refresh_token_hmac_key_v1.env_slug == "staging" &&
      infisical_secret.refresh_token_hmac_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.refresh_token_hmac_key_v1.name == "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL" &&
      infisical_secret.refresh_token_hmac_key_v1.value_wo_version == 1
    )
    error_message = "The staging refresh-token HMAC key must be delivered to the matching API runtime folder."
  }

  assert {
    condition = (
      infisical_secret.microservices_auth_jwt_private_key_v1.env_slug == "staging" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.name == "MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.value_wo_version == 1 &&
      infisical_secret.whatsapp_webhook_verify_token.env_slug == "staging" &&
      infisical_secret.whatsapp_webhook_verify_token.folder_path == "/generated/webhooks/runtime" &&
      infisical_secret.whatsapp_webhook_verify_token.name == "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN" &&
      infisical_secret.whatsapp_webhook_verify_token.value_wo_version == 1
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
      infisical_secret.microservices_auth_jwt_private_key_v1.workspace_id == module.infisical_project.id &&
      infisical_secret.microservices_auth_jwt_private_key_v1.env_slug == "production" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.name == "MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.value_wo_version == 1
    )
    error_message = "The production microservices JWT private key must be delivered to the matching API runtime folder."
  }

  assert {
    condition = (
      infisical_secret.whatsapp_webhook_verify_token.workspace_id == module.infisical_project.id &&
      infisical_secret.whatsapp_webhook_verify_token.env_slug == "production" &&
      infisical_secret.whatsapp_webhook_verify_token.folder_path == "/generated/webhooks/runtime" &&
      infisical_secret.whatsapp_webhook_verify_token.name == "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN" &&
      infisical_secret.whatsapp_webhook_verify_token.value_wo_version == 1
    )
    error_message = "The production WhatsApp webhook verification token must be delivered to the matching Webhooks runtime folder."
  }

  assert {
    condition = (
      infisical_secret.refresh_token_hmac_key_v1.env_slug == "production" &&
      infisical_secret.refresh_token_hmac_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.refresh_token_hmac_key_v1.name == "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL" &&
      infisical_secret.refresh_token_hmac_key_v1.value_wo_version == 1
    )
    error_message = "The production refresh-token HMAC key must be delivered to the matching API runtime folder."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
