mock_provider "upstash" {
  mock_resource "upstash_redis_database" {
    defaults = {
      database_type = "paid"
      endpoint      = "cataqui-api.upstash.io"
      rest_token    = "mock-rest-token"
      state         = "active"
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

run "staging_database" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      upstash_redis_database.api.database_name == "cataqui-api-staging" &&
      upstash_redis_database.api.region == "global" &&
      upstash_redis_database.api.primary_region == "sa-east-1" &&
      length(upstash_redis_database.api.read_regions) == 0 &&
      upstash_redis_database.api.budget == 5
    )
    error_message = "Staging must use the approved database identity, São Paulo primary, and monthly budget."
  }
}

run "production_database" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      upstash_redis_database.api.database_name == "cataqui-api-production" &&
      upstash_redis_database.api.region == "global" &&
      upstash_redis_database.api.primary_region == "sa-east-1" &&
      length(upstash_redis_database.api.read_regions) == 0 &&
      upstash_redis_database.api.budget == 25
    )
    error_message = "Production must use the approved database identity, São Paulo primary, and monthly budget."
  }
}

run "database_safety" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      upstash_redis_database.api.tls &&
      !upstash_redis_database.api.eviction &&
      !upstash_redis_database.api.auto_scale &&
      !upstash_redis_database.api.prod_pack
    )
    error_message = "Redis must use TLS without eviction, automatic fixed-plan upgrades, or Prod Pack."
  }
}

run "runtime_secret_delivery" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = alltrue([
      for secret in [
        infisical_secret.upstash_redis_rest_url,
        infisical_secret.upstash_redis_rest_token,
      ] : secret.workspace_id == module.infisical_project.id && secret.env_slug == "staging" && secret.folder_path == "/generated/api/runtime" && secret.value_wo_version == 1
    ])
    error_message = "Every Upstash runtime value must use the matching Infisical runtime folder and write-only version."
  }

  assert {
    condition = (
      infisical_secret.upstash_redis_rest_url.name == "UPSTASH_REDIS_REST_URL" &&
      local.redis_rest_url == "https://cataqui-api.upstash.io" &&
      infisical_secret.upstash_redis_rest_token.name == "UPSTASH_REDIS_REST_TOKEN"
    )
    error_message = "The root must publish exactly the API's Upstash REST URL and token contract."
  }
}

run "reject_free_database" {
  command = plan

  variables {
    environment = "staging"
  }

  override_resource {
    target = upstash_redis_database.api
    values = {
      database_type = "free"
      endpoint      = "cataqui-api.upstash.io"
      rest_token    = "mock-rest-token"
    }
  }

  expect_failures = [upstash_redis_database.api]
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
