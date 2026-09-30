resource "datadog_dashboard_json" "api" {
  dashboard = templatefile("${path.module}/dashboards/api.json.tftpl", {
    environment  = var.environment
    service      = local.service
    log_scope    = local.scope
    metric_scope = local.metric_scope
  })
}
