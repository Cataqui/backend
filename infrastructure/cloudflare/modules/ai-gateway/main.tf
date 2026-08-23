resource "cloudflare_ai_gateway" "this" {
  account_id = var.cloudflare_account_id
  id         = var.gateway_id

  authentication             = var.configuration.authentication
  cache_invalidate_on_update = var.configuration.cache_invalidate_on_update
  cache_ttl                  = var.configuration.cache_ttl
  collect_logs               = var.configuration.collect_logs
  log_management             = var.configuration.log_management
  log_management_strategy    = var.configuration.log_management_strategy
  logpush                    = var.configuration.logpush
  rate_limiting_interval     = var.configuration.rate_limiting_interval
  rate_limiting_limit        = var.configuration.rate_limiting_limit
  rate_limiting_technique    = var.configuration.rate_limiting_technique
  retry_backoff              = var.configuration.retry_backoff
  retry_delay                = var.configuration.retry_delay
  retry_max_attempts         = var.configuration.retry_max_attempts
  spend_limits               = var.configuration.spend_limits
  workers_ai_billing_mode    = var.configuration.workers_ai_billing_mode
  zdr                        = var.configuration.zdr

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [store_id]
  }
}
