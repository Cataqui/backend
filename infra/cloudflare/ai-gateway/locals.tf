locals {
  cloudflare_account_id = "1fca946385505503c59dd6a2a4eeb442"

  gateway_configuration_by_environment = {
    staging = {
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
          id         = "b37ce532"
          limit      = 10
          limit_type = "cost"
          technique  = "fixed"
          window     = 2592000
        }]
      }
      workers_ai_billing_mode = "postpaid"
      zdr                     = false
    }
    production = {
      authentication             = true
      cache_invalidate_on_update = false
      cache_ttl                  = 2628288
      collect_logs               = true
      log_management             = 10000000
      log_management_strategy    = "DELETE_OLDEST"
      logpush                    = false
      rate_limiting_interval     = 0
      rate_limiting_limit        = 0
      rate_limiting_technique    = "fixed"
      retry_backoff              = "exponential"
      retry_delay                = 1000
      retry_max_attempts         = 3
      spend_limits = {
        enabled = true
        rules = [{
          enabled    = true
          id         = "641a4100"
          limit      = 10
          limit_type = "cost"
          technique  = "sliding"
          window     = 86400
        }]
      }
      workers_ai_billing_mode = "postpaid"
      zdr                     = false
    }
  }

  gateway_configuration = local.gateway_configuration_by_environment[var.environment]
}
