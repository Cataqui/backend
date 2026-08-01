output "gateway_id" {
  description = "AI Gateway ID used by the Cataquí API Worker environment."
  value       = module.application.gateway_id
}

output "gateway_configuration" {
  description = "Non-secret configuration mirrored from the selected environment's existing AI Gateway."
  value = {
    authentication_enabled         = module.application.gateway_configuration.authentication
    cache_invalidate_on_update     = module.application.gateway_configuration.cache_invalidate_on_update
    cache_ttl_seconds              = module.application.gateway_configuration.cache_ttl
    log_management                 = module.application.gateway_configuration.log_management
    log_management_strategy        = module.application.gateway_configuration.log_management_strategy
    logpush_enabled                = module.application.gateway_configuration.logpush
    logs_collected                 = module.application.gateway_configuration.collect_logs
    rate_limiting_interval_seconds = module.application.gateway_configuration.rate_limiting_interval
    rate_limiting_limit            = module.application.gateway_configuration.rate_limiting_limit
    rate_limiting_technique        = module.application.gateway_configuration.rate_limiting_technique
    retry_backoff                  = module.application.gateway_configuration.retry_backoff
    retry_delay_milliseconds       = module.application.gateway_configuration.retry_delay
    retry_max_attempts             = module.application.gateway_configuration.retry_max_attempts
    spend_limits = {
      enabled = module.application.gateway_configuration.spend_limits.enabled
      rules = [for rule in module.application.gateway_configuration.spend_limits.rules : {
        enabled        = rule.enabled
        id             = rule.id
        limit          = rule.limit
        limit_type     = rule.limit_type
        technique      = rule.technique
        window_seconds = rule.window
      }]
    }
    workers_ai_billing_mode     = module.application.gateway_configuration.workers_ai_billing_mode
    zero_data_retention_enabled = module.application.gateway_configuration.zdr
  }
}
