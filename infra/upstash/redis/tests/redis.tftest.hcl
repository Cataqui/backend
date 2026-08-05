mock_provider "upstash" {}

override_resource {
  target          = upstash_redis_database.auth
  override_during = plan
  values = {
    database_id   = "staging-database-id"
    database_type = "free"
    endpoint      = "staging-cataqui.upstash.io"
    rest_token    = "staging-rest-token"
  }
}

run "staging_uses_the_free_plan_in_sao_paulo" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      output.database.database_name == "cataqui-api-staging" &&
      output.database.plan == "free" &&
      output.database.primary_region == "sa-east-1"
    )
    error_message = "Staging must use the free Upstash plan with São Paulo as its primary region."
  }
}

run "production_uses_the_pay_as_you_go_plan_in_sao_paulo" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_id   = "production-database-id"
      database_type = "payg"
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
      output.database.plan == "payg" &&
      output.database.primary_region == "sa-east-1"
    )
    error_message = "Production must use the pay-as-you-go Upstash plan with São Paulo as its primary region."
  }
}

run "an_upstash_account_with_the_wrong_staging_plan_is_rejected" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_type = "payg"
    }
  }

  variables {
    environment = "staging"
  }

  expect_failures = [upstash_redis_database.auth]
}

run "an_upstash_account_with_the_wrong_production_plan_is_rejected" {
  command = plan

  override_resource {
    target          = upstash_redis_database.auth
    override_during = plan
    values = {
      database_type = "free"
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
