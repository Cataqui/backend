locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  datadog_api_url = regex("^https://api\\.datadoghq\\.com$", local.platforms.datadog.api_url)

  critical_incident_notification_handles = join(" ", concat(
    sort(tolist(var.nonpaging_notification_handles)),
    sort(tolist(var.pager_notification_handles)),
  ))
  health_check_url                    = var.environment == "staging" ? "https://staging.api.cataqui.com/v1/health" : "https://api.cataqui.com/v1/health"
  auth_exchange_route                 = "/v1/auth/notp/intents/exchange"
  metric_scope                        = "service:${var.service_name},env:${var.environment}"
  nonpaging_notification_handles      = join(" ", sort(tolist(var.nonpaging_notification_handles)))
  pager_notification_handles          = join(" ", sort(tolist(var.pager_notification_handles)))
  public_api_metric_scope             = "${local.metric_scope},traffic_surface:public_api"
  standard_active_requests_scope      = "${local.metric_scope},!http_route:${local.auth_exchange_route}"
  standard_public_latency_scope       = "${local.public_api_metric_scope},!http_route:${local.auth_exchange_route}"
  alert_recovery_notification_routing = "${local.nonpaging_notification_handles} {{#is_alert_recovery}}${local.pager_notification_handles}{{/is_alert_recovery}}"
  telemetry_silence_threshold         = var.environment == "production" ? var.minimum_production_http_requests_per_15_minutes : -1
  worker_script_name                  = "cataqui-api-${var.environment}"
  webhooks_worker_script_name         = "cataqui-webhooks-${var.environment}"
  geosearch_worker_script_name        = "cataqui-geosearch-${var.environment}"
}
