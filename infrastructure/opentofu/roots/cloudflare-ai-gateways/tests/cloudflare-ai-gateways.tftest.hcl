mock_provider "cloudflare" {}

run "staging_gateways" {
  command = plan
  variables { environment = "staging" }

  assert {
    condition = (
      toset(keys(cloudflare_ai_gateway.application)) == toset(["api", "ai"]) &&
      cloudflare_ai_gateway.application["api"].id == "cataqui-api-staging" &&
      cloudflare_ai_gateway.application["ai"].id == "cataqui-ai-worker-staging" &&
      alltrue([for gateway in values(cloudflare_ai_gateway.application) : gateway.spend_limits.rules[0].limit == 5])
    )
    error_message = "Staging must have separate API and AI Worker gateways, each with a five-dollar budget."
  }
}

run "production_gateways" {
  command = plan
  variables { environment = "production" }

  assert {
    condition = (
      toset(keys(cloudflare_ai_gateway.application)) == toset(["api", "ai"]) &&
      cloudflare_ai_gateway.application["api"].id == "cataqui-api-production" &&
      cloudflare_ai_gateway.application["ai"].id == "cataqui-ai-worker-production" &&
      alltrue([for gateway in values(cloudflare_ai_gateway.application) : gateway.spend_limits.rules[0].limit == 50])
    )
    error_message = "Production must have separate API and AI Worker gateways, each with a fifty-dollar budget."
  }
}

run "gateway_security_and_cost_controls" {
  command = plan
  variables { environment = "staging" }

  assert {
    condition = alltrue([
      for gateway in values(cloudflare_ai_gateway.application) :
      gateway.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      gateway.authentication &&
      gateway.collect_logs &&
      !gateway.logpush &&
      gateway.cache_invalidate_on_update &&
      gateway.cache_ttl == 0 &&
      gateway.rate_limiting_interval == 0 &&
      gateway.rate_limiting_limit == 0 &&
      gateway.rate_limiting_technique == "fixed" &&
      gateway.retry_backoff == "constant" &&
      gateway.retry_delay == 0 &&
      gateway.retry_max_attempts == 1 &&
      gateway.workers_ai_billing_mode == "postpaid" &&
      !gateway.zdr
    ])
    error_message = "Every gateway must remain authenticated, observable, uncached, application-retried, and without unsupported ZDR."
  }

  assert {
    condition = alltrue([
      for gateway in values(cloudflare_ai_gateway.application) :
      gateway.spend_limits.enabled &&
      length(gateway.spend_limits.rules) == 1 &&
      gateway.spend_limits.rules[0].enabled &&
      gateway.spend_limits.rules[0].limit_type == "cost" &&
      gateway.spend_limits.rules[0].technique == "sliding" &&
      gateway.spend_limits.rules[0].window == 2592000
    ])
    error_message = "Each gateway must enforce its own rolling thirty-day cost limit across all its operations."
  }
}

run "reject_unsupported_environment" {
  command = plan
  variables { environment = "development" }
  expect_failures = [var.environment]
}
