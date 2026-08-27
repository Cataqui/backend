resource "datadog_monitor" "worker_edge_handoff_failures" {
  name         = "[${upper(var.environment)}] Cataquí API Worker public requests fail before or at container handoff"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.worker_script_name} (*:\\\"api.worker.request.rejected\\\" OR *:\\\"api.worker.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API Worker threw during public handoff or received a returned server rejection more than ${var.worker_edge_error_count_critical} times in five minutes. A thrown handoff never reaches the Nest request SLI; a returned 5xx may come from Nest or from the container/proxy boundary. Treat this as an edge availability incident and use correlated request IDs to compare Worker, container, and SLI records before assigning ownership. Inspect the active Worker version, container pool, and Cloudflare status. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API Worker recorded at least one thrown public handoff or returned server rejection in five minutes. Correlate the request ID with container logs and the Nest SLI so an edge-only failure cannot make the container-handled availability SLO misleading. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}API Worker public handoff and returned server rejections recovered in ${var.environment}. Confirm the Cloudflare Worker error monitor, container SLI, and public Synthetic are healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:edge_availability",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "container_runtime_failures" {
  name         = "[${upper(var.environment)}] Cataquí API container runtime is failing"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.worker_script_name} (*:\\\"api.container.runtime.failed\\\" OR *:\\\"api.container.stopped.unexpected\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.runtime_failure_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API container runtime failed or stopped unexpectedly more than ${var.runtime_failure_count_critical} times in five minutes. This lifecycle can fail while idle, outside request-scoped Worker errors and the Nest SLI. Inspect the bounded lifecycle event, exit code, active Worker version, container image, memory/runtime pressure, and Cloudflare container status. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API container runtime failed or stopped unexpectedly. Investigate before restarts become user-visible or exhaust the warm container pool. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}API container runtime lifecycle recovered in ${var.environment}. Confirm new containers start, reach the live endpoint, serve requests, and stop normally. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.runtime_failure_count_warning
    critical = var.runtime_failure_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:runtime_lifecycle",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "worker_inbound_call_failures" {
  name         = "[${upper(var.environment)}] Cataquí API Worker rejects trusted inbound calls"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.worker_script_name} (*:\\\"api.worker.inbound.call.rejected\\\" OR *:\\\"api.worker.inbound.call.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API Worker rejected or failed more than ${var.worker_edge_error_count_critical} trusted inbound calls in five minutes. This covers synchronous Worker RPC and other inbound work outside the public SLO. Inspect the bounded receiver, response status, correlated request ID, container health, and active Worker version. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API Worker rejected or failed at least one trusted inbound call in five minutes. Investigate before synchronous authentication or Queue-backed work is disrupted. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Trusted inbound delivery recovered in ${var.environment}. Confirm receiver-level outcomes and internal-inbound container metrics are healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:inbound_delivery",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "worker_outbound_call_failures" {
  name         = "[${upper(var.environment)}] Cataquí API Worker rejects outbound container calls"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.worker_script_name} (*:\\\"api.worker.outbound.call.rejected\\\" OR *:\\\"api.worker.outbound.call.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API Worker rejected or failed more than ${var.worker_edge_error_count_critical} outbound calls from API containers in five minutes. This independently covers the container-to-Worker transport used before Queue publication. Inspect the bounded outbound host, response status, correlated trace ID, active Worker version, and Queue health. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API Worker rejected or failed at least one outbound container call in five minutes. Investigate before durable job-data derivation publication is disrupted. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Outbound container delivery recovered in ${var.environment}. Confirm Queue publication operation metrics, batch outcomes, and backlog are healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:outbound_delivery",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "cloudflare_worker_errors" {
  name         = "[${upper(var.environment)}] Cataquí API Cloudflare Worker errors are elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_10m):sum:${var.cloudflare_worker_error_count_metric_name}{script_name:${local.worker_script_name}}.as_count() > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}Cloudflare reported more than ${var.worker_edge_error_count_critical} uncaught errors for ${local.worker_script_name} in ten minutes. This independent platform signal covers failures that may occur before structured Worker logs or Nest metrics exist. Start edge incident response. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}Cloudflare reported at least one uncaught error for ${local.worker_script_name} in ten minutes. Correlate the Worker version, handoff-failure logs, and container health. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Cloudflare Worker errors for ${local.worker_script_name} recovered. Confirm log export and public request health are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 300
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:edge_availability",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "webhooks_cloudflare_worker_errors" {
  name         = "[${upper(var.environment)}] Cataquí Webhooks Cloudflare Worker errors are elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_10m):sum:${var.cloudflare_worker_error_count_metric_name}{script_name:${local.webhooks_worker_script_name}}.as_count() > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}Cloudflare reported more than ${var.worker_edge_error_count_critical} uncaught errors for ${local.webhooks_worker_script_name} in ten minutes. Provider callbacks may be failing before an application lifecycle log or API delivery exists. Start ingress incident response. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}Cloudflare reported at least one uncaught error for ${local.webhooks_worker_script_name} in ten minutes. Correlate Webhooks lifecycle logs, synchronous API delivery, and the active Worker version. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Cloudflare Worker errors for ${local.webhooks_worker_script_name} recovered. Confirm signed provider requests and synchronous API delivery are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 300
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:webhook_ingress",
    "team:${var.team_name}",
    "worker_service:${local.webhooks_worker_script_name}",
  ]
}

resource "datadog_monitor" "webhooks_request_failures" {
  name         = "[${upper(var.environment)}] Cataquí Webhooks request lifecycle failures"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.webhooks_worker_script_name} (*:\\\"webhooks.request.rejected\\\" OR *:\\\"webhooks.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} Webhooks Worker rejected or threw while processing more than ${var.worker_edge_error_count_critical} provider requests in five minutes. Inspect the bounded route, method, response status, request ID, active version, and delivery monitor. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} Webhooks Worker rejected or threw while processing at least one provider request in five minutes. Investigate the lifecycle failure and its correlated delivery before callbacks are retried upstream. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Webhooks request processing recovered in ${var.environment}. Confirm lifecycle outcomes and Cloudflare platform errors are healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:webhook_ingress",
    "team:${var.team_name}",
    "worker_service:${local.webhooks_worker_script_name}",
  ]
}

resource "datadog_monitor" "webhooks_inbound_delivery_failures" {
  name         = "[${upper(var.environment)}] Cataquí Webhooks authentication inbound calls are rejected"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.webhooks_worker_script_name} *:\\\"webhooks.api.inbound.delivery.rejected\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The API Worker rejected more than ${var.worker_edge_error_count_critical} synchronous authentication deliveries from the ${var.environment} Webhooks Worker in five minutes. Inspect the receiver, response status, correlated request ID, both Worker versions, and API container health. Unexpected binding failures remain covered by the Webhooks request-failure monitor. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}At least one synchronous Webhooks-to-API authentication delivery was rejected in ${var.environment}. Investigate before users exhaust their authentication exchange window. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Synchronous Webhooks-to-API authentication delivery rejections recovered in ${var.environment}. Confirm direct inbound and authentication-exchange signals are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:inbound_delivery",
    "team:${var.team_name}",
    "worker_service:${local.webhooks_worker_script_name}",
  ]
}

resource "datadog_monitor" "geosearch_cloudflare_worker_errors" {
  name         = "[${upper(var.environment)}] Cataquí Geosearch Cloudflare Worker errors are elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_10m):sum:${var.cloudflare_worker_error_count_metric_name}{script_name:${local.geosearch_worker_script_name}}.as_count() > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}Cloudflare reported more than ${var.worker_edge_error_count_critical} uncaught errors for ${local.geosearch_worker_script_name} in ten minutes. Address search may be failing before an application lifecycle or provider record exists. Start Geosearch incident response. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}Cloudflare reported at least one uncaught error for ${local.geosearch_worker_script_name} in ten minutes. Correlate the active Worker version, bounded request lifecycle, and Google Places operation logs. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Cloudflare Worker errors for ${local.geosearch_worker_script_name} recovered. Confirm address search, details, and provider operations are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 300
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:geosearch_ingress",
    "team:${var.team_name}",
    "worker_service:${local.geosearch_worker_script_name}",
  ]
}

resource "datadog_monitor" "geosearch_request_failures" {
  name         = "[${upper(var.environment)}] Cataquí Geosearch requests throw unexpectedly"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.geosearch_worker_script_name} *:\\\"geosearch.request.failed\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} Geosearch Worker threw unexpectedly while processing more than ${var.worker_edge_error_count_critical} requests in five minutes. Inspect the bounded route, method, status, safe stack frames, request ID, and active version. Returned Google Places failures are intentionally owned by the provider monitor to avoid duplicate incident pages. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} Geosearch Worker threw unexpectedly while processing at least one request in five minutes. Correlate the request lifecycle with Cloudflare platform errors and any provider operation. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Unexpected Geosearch request failures recovered in ${var.environment}. Confirm search, details, and provider outcomes are healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:geosearch_ingress",
    "team:${var.team_name}",
    "worker_service:${local.geosearch_worker_script_name}",
  ]
}

resource "datadog_monitor" "geosearch_provider_failures" {
  name         = "[${upper(var.environment)}] Cataquí Geosearch provider operations are failing"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.geosearch_worker_script_name} (*:\\\"geosearch.provider.request.rejected\\\" OR *:\\\"geosearch.provider.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.worker_edge_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}Google Places operations rejected or threw more than ${var.worker_edge_error_count_critical} times in five minutes for ${var.environment}. Inspect the bounded operation and outcome, duration, correlated request ID, provider status, and active Worker version. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}At least one Google Places operation rejected or threw in five minutes for ${var.environment}. Determine whether the failure is a timeout, provider rejection, malformed provider response, or local mapping failure. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Geosearch provider operations recovered in ${var.environment}. Confirm search and details latency and success outcomes are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_edge_error_count_warning
    critical = var.worker_edge_error_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:geosearch_provider",
    "team:${var.team_name}",
    "worker_service:${local.geosearch_worker_script_name}",
  ]
}

resource "datadog_monitor" "worker_queue_retries" {
  name         = "[${upper(var.environment)}] Cataquí API Queue batches are retrying"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${local.worker_script_name} (*:\\\"api.worker.queue.batch.failed\\\" OR (*:\\\"api.worker.queue.batch.completed\\\" AND *:\\\"RETRY_SCHEDULED\\\"))\").index(\"*\").rollup(\"count\").last(\"10m\") > ${var.worker_queue_retry_batch_count_critical}"
  message      = <<-EOT
    {{#is_alert}}More than ${var.worker_queue_retry_batch_count_critical} Queue batches failed or scheduled retries in ten minutes for ${var.environment}. Inspect bounded queue, invalid-message, retried-message, response-status, and release fields; then verify backlog age and the configured dead-letter queue in Cloudflare. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}At least one Queue batch failed or scheduled retries in ten minutes for ${var.environment}. Investigate delivery before retries exhaust and messages reach the dead-letter queue. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Queue batch delivery recovered in ${var.environment}. Confirm backlog count, oldest-message age, and dead-letter queue depth have returned to normal. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  enable_logs_sample       = false
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = false
  priority                 = "2"
  renotify_interval        = 60
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.worker_queue_retry_batch_count_warning
    critical = var.worker_queue_retry_batch_count_critical
  }

  assets {
    category = "runbook"
    name     = "Cataquí API observability runbook"
    url      = var.runbook_url
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:queue_delivery",
    "team:${var.team_name}",
  ]
}
