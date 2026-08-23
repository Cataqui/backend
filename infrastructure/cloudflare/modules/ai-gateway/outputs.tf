output "gateway_id" {
  description = "Managed AI Gateway identifier."
  value       = cloudflare_ai_gateway.this.id
}

output "gateway_configuration" {
  description = "Managed non-secret AI Gateway configuration."
  value = {
    authentication             = cloudflare_ai_gateway.this.authentication
    cache_invalidate_on_update = cloudflare_ai_gateway.this.cache_invalidate_on_update
    cache_ttl                  = cloudflare_ai_gateway.this.cache_ttl
    collect_logs               = cloudflare_ai_gateway.this.collect_logs
    log_management             = cloudflare_ai_gateway.this.log_management
    log_management_strategy    = cloudflare_ai_gateway.this.log_management_strategy
    logpush                    = cloudflare_ai_gateway.this.logpush
    rate_limiting_interval     = cloudflare_ai_gateway.this.rate_limiting_interval
    rate_limiting_limit        = cloudflare_ai_gateway.this.rate_limiting_limit
    rate_limiting_technique    = cloudflare_ai_gateway.this.rate_limiting_technique
    retry_backoff              = cloudflare_ai_gateway.this.retry_backoff
    retry_delay                = cloudflare_ai_gateway.this.retry_delay
    retry_max_attempts         = cloudflare_ai_gateway.this.retry_max_attempts
    spend_limits               = cloudflare_ai_gateway.this.spend_limits
    workers_ai_billing_mode    = cloudflare_ai_gateway.this.workers_ai_billing_mode
    zdr                        = cloudflare_ai_gateway.this.zdr
  }
}
