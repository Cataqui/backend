locals {
  datadog_organization_viewer_principal = toset(["org:${var.datadog_organization_id}"])
  observability_editor_principals = toset([
    for role_id in var.observability_editor_role_ids : "role:${role_id}"
  ])
  managed_monitor_ids = {
    active_http_requests                       = datadog_monitor.active_http_requests.id
    application_lifecycle_failures             = datadog_monitor.application_lifecycle_failures.id
    auth_exchange_active_requests_per_instance = datadog_monitor.auth_exchange_active_requests_per_instance.id
    auth_exchange_latency_p95                  = datadog_monitor.auth_exchange_latency_p95.id
    authentication_recovery_failures           = datadog_monitor.authentication_recovery_failures.id
    availability_fast_burn                     = datadog_monitor.availability_fast_burn.id
    availability_slow_burn                     = datadog_monitor.availability_slow_burn.id
    cloudflare_worker_errors                   = datadog_monitor.cloudflare_worker_errors.id
    container_runtime_failures                 = datadog_monitor.container_runtime_failures.id
    event_loop_delay_p99                       = datadog_monitor.event_loop_delay_p99.id
    event_loop_utilization                     = datadog_monitor.event_loop_utilization.id
    failed_backend_operations                  = datadog_monitor.failed_backend_operations.id
    geosearch_cloudflare_worker_errors         = datadog_monitor.geosearch_cloudflare_worker_errors.id
    geosearch_provider_failures                = datadog_monitor.geosearch_provider_failures.id
    geosearch_request_failures                 = datadog_monitor.geosearch_request_failures.id
    heap_pressure                              = datadog_monitor.heap_pressure.id
    http_latency_p95                           = datadog_monitor.http_latency_p95.id
    http_server_error_rate                     = datadog_monitor.http_server_error_rate.id
    http_telemetry_silence                     = datadog_monitor.http_telemetry_silence.id
    rate_limit_enforcement_failures            = datadog_monitor.rate_limit_enforcement_failures.id
    typed_server_errors                        = datadog_monitor.typed_server_errors.id
    webhooks_cloudflare_worker_errors          = datadog_monitor.webhooks_cloudflare_worker_errors.id
    webhooks_inbound_delivery_failures         = datadog_monitor.webhooks_inbound_delivery_failures.id
    webhooks_request_failures                  = datadog_monitor.webhooks_request_failures.id
    worker_edge_handoff_failures               = datadog_monitor.worker_edge_handoff_failures.id
    worker_inbound_call_failures               = datadog_monitor.worker_inbound_call_failures.id
    worker_outbound_call_failures              = datadog_monitor.worker_outbound_call_failures.id
    worker_queue_retries                       = datadog_monitor.worker_queue_retries.id
  }
}

module "monitor_restriction_policy" {
  for_each = local.managed_monitor_ids
  source   = "../../modules/datadog-restriction-policy"

  editor_principals = local.observability_editor_principals
  resource_id       = "monitor:${each.value}"
  viewer_principals = local.datadog_organization_viewer_principal
}

module "availability_slo_restriction_policy" {
  source = "../../modules/datadog-restriction-policy"

  editor_principals = local.observability_editor_principals
  resource_id       = "slo:${datadog_service_level_objective.api_availability.id}"
  viewer_principals = local.datadog_organization_viewer_principal
}

module "synthetic_test_restriction_policy" {
  count  = var.enable_synthetics ? 1 : 0
  source = "../../modules/datadog-restriction-policy"

  editor_principals = local.observability_editor_principals
  resource_id       = "synthetics-test:${datadog_synthetics_test.api_health[0].id}"
  viewer_principals = local.datadog_organization_viewer_principal
}
