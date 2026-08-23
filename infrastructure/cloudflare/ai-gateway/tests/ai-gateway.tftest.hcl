mock_provider "cloudflare" {}

override_resource {
  target = module.application.cloudflare_ai_gateway.this
}

run "staging_uses_the_gateway_id_configured_in_the_worker" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = output.gateway_id == "staging"
    error_message = "The staging AI Gateway ID must match the Gateway configured in the API Worker's wrangler.jsonc."
  }
}

run "production_uses_the_gateway_id_configured_in_the_worker" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = output.gateway_id == "production"
    error_message = "The production AI Gateway ID must match the Gateway configured in the API Worker's wrangler.jsonc."
  }
}

run "staging_matches_its_existing_gateway_configuration" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      output.gateway_configuration.authentication_enabled == true &&
      output.gateway_configuration.cache_ttl_seconds == 0 &&
      output.gateway_configuration.cache_invalidate_on_update == false &&
      output.gateway_configuration.logs_collected == true &&
      output.gateway_configuration.log_management == 10000 &&
      output.gateway_configuration.log_management_strategy == "DELETE_OLDEST" &&
      output.gateway_configuration.logpush_enabled == false &&
      output.gateway_configuration.rate_limiting_interval_seconds == 60 &&
      output.gateway_configuration.rate_limiting_limit == 30 &&
      output.gateway_configuration.rate_limiting_technique == "fixed" &&
      output.gateway_configuration.retry_max_attempts == null &&
      output.gateway_configuration.retry_delay_milliseconds == null &&
      output.gateway_configuration.retry_backoff == null &&
      output.gateway_configuration.spend_limits.enabled == true &&
      length(output.gateway_configuration.spend_limits.rules) == 1 &&
      output.gateway_configuration.spend_limits.rules[0].enabled == true &&
      output.gateway_configuration.spend_limits.rules[0].id == "b37ce532" &&
      output.gateway_configuration.spend_limits.rules[0].limit == 10 &&
      output.gateway_configuration.spend_limits.rules[0].limit_type == "cost" &&
      output.gateway_configuration.spend_limits.rules[0].window_seconds == 2592000 &&
      output.gateway_configuration.spend_limits.rules[0].technique == "fixed" &&
      output.gateway_configuration.workers_ai_billing_mode == "postpaid" &&
      output.gateway_configuration.zero_data_retention_enabled == false
    )
    error_message = "The staging Terraform configuration must match the existing staging AI Gateway."
  }
}

run "production_matches_its_existing_gateway_configuration" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      output.gateway_configuration.authentication_enabled == true &&
      output.gateway_configuration.cache_ttl_seconds == 2628288 &&
      output.gateway_configuration.cache_invalidate_on_update == false &&
      output.gateway_configuration.logs_collected == true &&
      output.gateway_configuration.log_management == 10000000 &&
      output.gateway_configuration.log_management_strategy == "DELETE_OLDEST" &&
      output.gateway_configuration.logpush_enabled == false &&
      output.gateway_configuration.rate_limiting_interval_seconds == 0 &&
      output.gateway_configuration.rate_limiting_limit == 0 &&
      output.gateway_configuration.rate_limiting_technique == "fixed" &&
      output.gateway_configuration.retry_max_attempts == 3 &&
      output.gateway_configuration.retry_delay_milliseconds == 1000 &&
      output.gateway_configuration.retry_backoff == "exponential" &&
      output.gateway_configuration.spend_limits.enabled == true &&
      length(output.gateway_configuration.spend_limits.rules) == 1 &&
      output.gateway_configuration.spend_limits.rules[0].enabled == true &&
      output.gateway_configuration.spend_limits.rules[0].id == "641a4100" &&
      output.gateway_configuration.spend_limits.rules[0].limit == 10 &&
      output.gateway_configuration.spend_limits.rules[0].limit_type == "cost" &&
      output.gateway_configuration.spend_limits.rules[0].window_seconds == 86400 &&
      output.gateway_configuration.spend_limits.rules[0].technique == "sliding" &&
      output.gateway_configuration.workers_ai_billing_mode == "postpaid" &&
      output.gateway_configuration.zero_data_retention_enabled == false
    )
    error_message = "The production Terraform configuration must match the existing production AI Gateway."
  }
}

run "unsupported_environments_are_rejected_before_infrastructure_is_planned" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
