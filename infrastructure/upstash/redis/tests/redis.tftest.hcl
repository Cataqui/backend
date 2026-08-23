mock_provider "upstash" {}

override_resource {
  target          = upstash_redis_database.auth
  override_during = plan
  values = {
    database_id   = "staging-database-id"
    database_type = "Pay as You Go"
    endpoint      = "staging-cataqui.upstash.io"
    rest_token    = "staging-rest-token"
  }
}

run "staging_uses_pay_as_you_go_in_sao_paulo" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      output.database.database_name == "cataqui-api-staging" &&
      output.database.database_type == "Pay as You Go" &&
      output.database.primary_region == "sa-east-1"
    )
    error_message = "Staging must use the Pay as You Go Upstash database type with São Paulo as its primary region."
  }
}

run "production_uses_pay_as_you_go_in_sao_paulo" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_id   = "production-database-id"
      database_type = "Pay as You Go"
      endpoint      = "production-cataqui.upstash.io"
      rest_token    = "production-rest-token"
    }
  }

  variables {
    environment = "production"
  }

  assert {
    condition = (
      output.database.database_name == "cataqui-api-production" &&
      output.database.database_type == "Pay as You Go" &&
      output.database.primary_region == "sa-east-1"
    )
    error_message = "Production must use the Pay as You Go Upstash database type with São Paulo as its primary region."
  }
}

run "a_staging_database_that_is_not_pay_as_you_go_is_rejected" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_type = "Free"
    }
  }

  variables {
    environment = "staging"
  }

  expect_failures = [upstash_redis_database.auth]
}

run "a_production_database_that_is_not_pay_as_you_go_is_rejected" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_type = "Free"
    }
  }

  variables {
    environment = "production"
  }

  expect_failures = [upstash_redis_database.auth]
}

run "unsupported_environments_are_rejected_before_infrastructure_is_planned" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
