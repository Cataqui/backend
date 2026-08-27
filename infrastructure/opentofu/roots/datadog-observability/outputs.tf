output "dashboard_urls" {
  description = "Datadog URLs for the managed service-health, ingress/authentication, and product/runtime dashboards."
  value = {
    ingress_and_authentication = datadog_dashboard.ingress_and_authentication.url
    product_and_runtime        = datadog_dashboard.product_and_runtime.url
    service_health             = datadog_dashboard.service_health.url
  }
}

output "monitor_ids" {
  description = "Datadog identifiers for every managed API, Webhooks, authentication, runtime, and delivery monitor."
  value       = local.managed_monitor_ids
}

output "availability_slo" {
  description = "Identity and primary target of the managed container-handled public-request availability SLO."
  value = {
    id              = datadog_service_level_objective.api_availability.id
    name            = datadog_service_level_objective.api_availability.name
    target_percent  = var.availability_slo_target_percent
    timeframe       = datadog_service_level_objective.api_availability.timeframe
    warning_percent = var.availability_slo_warning_percent
  }
}

output "access_control" {
  description = "Restriction-policy identities protecting every managed monitor, the availability SLO, and the optional Synthetic test."
  value = {
    availability_slo_policy_id = module.availability_slo_restriction_policy.id
    monitor_policy_ids = {
      for monitor_name, policy in module.monitor_restriction_policy : monitor_name => policy.id
    }
    synthetic_test_policy_id = var.enable_synthetics ? module.synthetic_test_restriction_policy[0].id : null
  }
}

output "synthetic_test" {
  description = "The optional public health Synthetic identity and endpoint, or null while Synthetics remains intentionally disabled."
  value = var.enable_synthetics ? {
    id         = datadog_synthetics_test.api_health[0].id
    monitor_id = datadog_synthetics_test.api_health[0].monitor_id
    url        = local.health_check_url
  } : null
}

output "metric_contract" {
  description = "Application and runtime metric names queried by the managed Datadog resources."
  value = {
    active_http_requests        = var.active_http_requests_metric_name
    api_error_count             = var.api_error_count_metric_name
    cloudflare_worker_errors    = var.cloudflare_worker_error_count_metric_name
    cloudflare_worker_requests  = var.cloudflare_worker_request_count_metric_name
    cloudflare_worker_p99       = var.cloudflare_worker_response_time_p99_metric_name
    event_loop_delay_p99        = var.event_loop_delay_p99_metric_name
    event_loop_utilization      = var.event_loop_utilization_metric_name
    garbage_collection_duration = var.garbage_collection_duration_metric_name
    heap_size                   = var.heap_size_metric_name
    heap_used                   = var.heap_used_metric_name
    http_request_count          = var.http_request_count_metric_name
    http_request_duration       = var.http_request_duration_metric_name
    operation_count             = var.operation_count_metric_name
    operation_duration          = var.operation_duration_metric_name
    product_event_count         = var.product_event_count_metric_name
  }
}
