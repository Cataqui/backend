mock_provider "infisical" {}
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
      ephemeral.tls_private_key.microservices_auth_jwt_v1.algorithm == "ECDSA" &&
      ephemeral.tls_private_key.microservices_auth_jwt_v1.ecdsa_curve == "P256"
    )
    error_message = "The API auth keys must use a 32-byte HMAC key and an ES256-compatible ECDSA P-256 private key."
  }

  assert {
    condition = (
      infisical_secret.refresh_token_hmac_key_v1.workspace_id == "954d434f-7e08-4904-af66-0bf62377794e" &&
      infisical_secret.refresh_token_hmac_key_v1.env_slug == "staging" &&
      infisical_secret.refresh_token_hmac_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.refresh_token_hmac_key_v1.name == "AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL" &&
      infisical_secret.refresh_token_hmac_key_v1.value_wo_version == 1
    )
    error_message = "The staging refresh-token HMAC key must be delivered to the matching API runtime folder."
  }
}

run "production_auth_keys" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret.microservices_auth_jwt_private_key_v1.workspace_id == "954d434f-7e08-4904-af66-0bf62377794e" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.env_slug == "production" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.folder_path == "/generated/api/runtime" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.name == "MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64" &&
      infisical_secret.microservices_auth_jwt_private_key_v1.value_wo_version == 1
    )
    error_message = "The production microservices JWT private key must be delivered to the matching API runtime folder."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
