resource "cloudflare_ai_gateway" "application" {
  for_each = local.gateways

  account_id                 = local.cloudflare_account_id
  id                         = each.value
  authentication             = true
  cache_invalidate_on_update = true
  cache_ttl                  = 0
  collect_logs               = true
  logpush                    = false
  rate_limiting_interval     = 0
  rate_limiting_limit        = 0
  rate_limiting_technique    = "fixed"
  retry_backoff              = "constant"
  retry_delay                = 0
  retry_max_attempts         = 1
  workers_ai_billing_mode    = "postpaid"
  zdr                        = false

  spend_limits = {
    enabled = true
    rules = [{
      enabled    = true
      limit      = local.spend_limit
      limit_type = "cost"
      technique  = "sliding"
      window     = 2592000
    }]
  }
}
