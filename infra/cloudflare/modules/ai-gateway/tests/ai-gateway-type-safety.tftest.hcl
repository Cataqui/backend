mock_provider "cloudflare" {}

variables {
  cloudflare_account_id = "00000000000000000000000000000000"
  gateway_id            = "staging"
  configuration = {
    authentication             = true
    cache_invalidate_on_update = false
    cache_ttl                  = 0
    collect_logs               = true
    log_management             = 10000
    log_management_strategy    = "DELETE_OLDEST"
    logpush                    = false
    rate_limiting_interval     = 60
    rate_limiting_limit        = 30
    rate_limiting_technique    = "fixed"
    retry_backoff              = null
    retry_delay                = null
    retry_max_attempts         = null
    spend_limits = {
      enabled = true
      rules = [{
        enabled    = true
        id         = "test-rule"
        limit      = 10
        limit_type = "cost"
        technique  = "fixed"
        window     = 2592000
      }]
    }
    workers_ai_billing_mode = "postpaid"
    zdr                     = false
  }
  configuration_shape = {
    top_level = toset([
      "authentication",
      "cache_invalidate_on_update",
      "cache_ttl",
      "collect_logs",
      "log_management",
      "log_management_strategy",
      "logpush",
      "rate_limiting_interval",
      "rate_limiting_limit",
      "rate_limiting_technique",
      "retry_backoff",
      "retry_delay",
      "retry_max_attempts",
      "spend_limits",
      "workers_ai_billing_mode",
      "zdr",
    ])
    spend_limits = toset([
      "enabled",
      "rules",
    ])
    spend_limit_rules = [toset([
      "enabled",
      "id",
      "limit",
      "limit_type",
      "technique",
      "window",
    ])]
  }
}

run "unknown_top_level_fields_are_rejected_instead_of_silently_discarded" {
  command = plan

  variables {
    configuration_shape = {
      top_level         = setunion(var.configuration_shape.top_level, ["unexpected"])
      spend_limits      = var.configuration_shape.spend_limits
      spend_limit_rules = var.configuration_shape.spend_limit_rules
    }
  }

  expect_failures = [var.configuration_shape]
}

run "unknown_spend_limit_fields_are_rejected_instead_of_silently_discarded" {
  command = plan

  variables {
    configuration_shape = {
      top_level         = var.configuration_shape.top_level
      spend_limits      = setunion(var.configuration_shape.spend_limits, ["unexpected"])
      spend_limit_rules = var.configuration_shape.spend_limit_rules
    }
  }

  expect_failures = [var.configuration_shape]
}

run "unknown_spend_limit_rule_fields_are_rejected_instead_of_silently_discarded" {
  command = plan

  variables {
    configuration_shape = {
      top_level    = var.configuration_shape.top_level
      spend_limits = var.configuration_shape.spend_limits
      spend_limit_rules = [
        setunion(var.configuration_shape.spend_limit_rules[0], ["unexpected"]),
      ]
    }
  }

  expect_failures = [var.configuration_shape]
}

run "every_spend_limit_rule_is_covered_by_exact_shape_validation" {
  command = plan

  variables {
    configuration_shape = {
      top_level         = var.configuration_shape.top_level
      spend_limits      = var.configuration_shape.spend_limits
      spend_limit_rules = []
    }
  }

  expect_failures = [var.configuration_shape]
}
