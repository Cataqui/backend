resource "cloudflare_ai_gateway" "derive_job_data" {
  account_id                 = local.cloudflare_account_id
  id                         = local.derive_job_data_gateway.id
  authentication             = true
  cache_invalidate_on_update = true
  cache_ttl                  = 0
  collect_logs               = false
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
      limit      = local.derive_job_data_gateway.spend_limit
      limit_type = "cost"
      technique  = "sliding"
      window     = 2592000
    }]
  }
}
