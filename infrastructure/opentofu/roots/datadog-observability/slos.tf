resource "datadog_service_level_objective" "api_availability" {
  name        = "Cataquí API ${var.environment} container-handled request availability"
  type        = "metric"
  description = "Percentage of non-aborted public requests completed inside ${var.service_name} with a GOOD availability outcome. This container-handled SLI is independent of trace sampling; separate Worker edge monitors cover failures before Nest receives a request."
  timeframe   = "30d"

  target_threshold  = var.availability_slo_target_percent
  warning_threshold = var.availability_slo_warning_percent
  validate          = true

  query {
    numerator   = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},availability_outcome:good}.as_count()"
    denominator = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},!availability_outcome:excluded}.as_count()"
  }

  thresholds {
    timeframe = "7d"
    target    = var.availability_slo_target_percent
    warning   = var.availability_slo_warning_percent
  }

  thresholds {
    timeframe = "30d"
    target    = var.availability_slo_target_percent
    warning   = var.availability_slo_warning_percent
  }

  thresholds {
    timeframe = "90d"
    target    = var.availability_slo_target_percent
    warning   = var.availability_slo_warning_percent
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "team:${var.team_name}",
  ]
}
