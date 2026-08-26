mock_provider "cloudflare" {}

run "staging_gateway" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = cloudflare_ai_gateway.derive_job_data.id == "cataqui-derive-job-data-staging"
    error_message = "Staging must use its task-specific gateway ID."
  }

  assert {
    condition     = cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].limit == 5
    error_message = "Staging must have a five-dollar spend limit."
  }
}

run "production_gateway" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = cloudflare_ai_gateway.derive_job_data.id == "cataqui-derive-job-data-production"
    error_message = "Production must use its task-specific gateway ID."
  }

  assert {
    condition     = cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].limit == 50
    error_message = "Production must have a fifty-dollar spend limit."
  }
}

run "gateway_security_and_cost_controls" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      cloudflare_ai_gateway.derive_job_data.authentication &&
      cloudflare_ai_gateway.derive_job_data.collect_logs &&
      !cloudflare_ai_gateway.derive_job_data.logpush &&
      cloudflare_ai_gateway.derive_job_data.cache_invalidate_on_update &&
      cloudflare_ai_gateway.derive_job_data.cache_ttl == 0 &&
      cloudflare_ai_gateway.derive_job_data.rate_limiting_interval == 0 &&
      cloudflare_ai_gateway.derive_job_data.rate_limiting_limit == 0 &&
      cloudflare_ai_gateway.derive_job_data.retry_backoff == "constant" &&
      cloudflare_ai_gateway.derive_job_data.retry_delay == 0 &&
      cloudflare_ai_gateway.derive_job_data.retry_max_attempts == 1 &&
      cloudflare_ai_gateway.derive_job_data.workers_ai_billing_mode == "postpaid" &&
      !cloudflare_ai_gateway.derive_job_data.zdr
    )
    error_message = "The gateway must remain authenticated, observable, uncached, application-retried, and without unsupported ZDR."
  }

  assert {
    condition = (
      cloudflare_ai_gateway.derive_job_data.spend_limits.enabled &&
      cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].enabled &&
      cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].limit_type == "cost" &&
      cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].technique == "sliding" &&
      cloudflare_ai_gateway.derive_job_data.spend_limits.rules[0].window == 2592000
    )
    error_message = "The gateway must enforce a global rolling thirty-day cost limit."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
