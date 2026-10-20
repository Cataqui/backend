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
mock_provider "cloudflare" {}
variables {
  environment       = "staging"
  database_host     = "ep-test.aws.sa-east-1.neon.tech"
  database_password = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
run "isolated_auth_database_pool" {
  command = plan
  assert {
    condition = (
      cloudflare_hyperdrive_config.auth.name == "cataqui-auth-staging" &&
      cloudflare_hyperdrive_config.auth.origin.database == "auth" &&
      cloudflare_hyperdrive_config.auth.origin.user == "auth_user" &&
      cloudflare_hyperdrive_config.auth.caching.disabled &&
      infisical_secret.auth_hyperdrive_id.folder_path == "/generated/auth/deployment" &&
      infisical_secret.auth_hyperdrive_id.name == "HYPERDRIVE_ID"
    )
    error_message = "Auth must use its restricted direct origin with query caching disabled and deployment-only binding ID."
  }
}
run "reject_pooled_origin" {
  command = plan
  variables { database_host = "ep-test-pooler.aws.sa-east-1.neon.tech" }
  expect_failures = [var.database_host]
}
run "reject_unsupported_environment" {
  command = plan
  variables { environment = "development" }
  expect_failures = [var.environment]
}
