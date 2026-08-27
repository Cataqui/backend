resource "datadog_monitor" "http_server_error_rate" {
  name         = "[${upper(var.environment)}] Cataquí API server-error rate is consuming availability"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_5m):sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},availability_outcome:bad}.as_count() / sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},!availability_outcome:excluded}.as_count() * 100 > ${var.http_error_rate_critical_percent}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} server-error rate exceeded ${var.http_error_rate_critical_percent}% for five minutes. Current value: {{value}}%. Treat this as a user-visible availability incident. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} ${var.service_name} server-error rate exceeded ${var.http_error_rate_warning_percent}% for five minutes. Current value: {{value}}%. Investigate normalized routes, stable error codes, and the active release before the error budget accelerates. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}The ${var.environment} ${var.service_name} server-error rate recovered. Confirm the SLO burn-rate monitors have also recovered. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 60
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.http_error_rate_warning_percent
    critical = var.http_error_rate_critical_percent
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
    "signal:availability",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "http_latency_p95" {
  name         = "[${upper(var.environment)}] Cataquí API p95 latency is elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "percentile(last_5m):p95:${var.http_request_duration_metric_name}{${local.standard_public_latency_scope},!availability_outcome:excluded} > ${var.http_latency_p95_critical_seconds}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} p95 HTTP latency exceeded ${var.http_latency_p95_critical_seconds}s for five minutes. Current value: {{value}}s. Check latency by normalized route, backend-operation duration, event-loop pressure, and the active service version. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} ${var.service_name} p95 HTTP latency exceeded ${var.http_latency_p95_warning_seconds}s for five minutes. Current value: {{value}}s. Investigate before this becomes user-visible. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}The ${var.environment} ${var.service_name} p95 HTTP latency recovered. Confirm route-level latency and saturation are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.http_latency_p95_warning_seconds
    critical = var.http_latency_p95_critical_seconds
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
    "signal:latency",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "auth_exchange_latency_p95" {
  name         = "[${upper(var.environment)}] Cataquí authentication exchange p95 latency is elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "percentile(last_5m):p95:${var.http_request_duration_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},!availability_outcome:excluded} > ${var.auth_exchange_latency_p95_critical_seconds}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} authentication-exchange p95 exceeded ${var.auth_exchange_latency_p95_critical_seconds}s for five minutes, crossing the long-poll lease-expiration boundary. Inspect Redis subscription readiness, authoritative reads, container capacity, event-loop pressure, and the active release. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} authentication-exchange p95 exceeded ${var.auth_exchange_latency_p95_warning_seconds}s for five minutes. This is above the expected long-poll completion window; investigate before exchanges time out. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Authentication-exchange latency recovered in ${var.environment}. Confirm exchange outcomes and per-instance active exchanges are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.auth_exchange_latency_p95_warning_seconds
    critical = var.auth_exchange_latency_p95_critical_seconds
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
    "signal:authentication",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "active_http_requests" {
  name         = "[${upper(var.environment)}] Cataquí API concurrent request saturation"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "avg(last_5m):sum:${var.active_http_requests_metric_name}{${local.standard_active_requests_scope}} > ${var.active_http_requests_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} averaged more than ${var.active_http_requests_critical} concurrent requests for five minutes. Current value: {{value}}. Check request rate, downstream latency, event-loop pressure, and Cloudflare container scaling. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} ${var.service_name} averaged more than ${var.active_http_requests_warning} concurrent requests for five minutes. Current value: {{value}}. Investigate sustained saturation. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Concurrent request saturation for ${var.environment} ${var.service_name} recovered. Confirm latency and error rate are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.active_http_requests_warning
    critical = var.active_http_requests_critical
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
    "signal:saturation",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "auth_exchange_active_requests_per_instance" {
  name         = "[${upper(var.environment)}] Cataquí authentication exchange capacity is saturated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "avg(last_5m):max:${var.active_http_requests_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route}} by {service.instance.id} > ${var.auth_exchange_active_requests_per_instance_critical}"
  message      = <<-EOT
    {{#is_alert}}Container {{service.instance.id.name}} in ${var.environment} averaged more than ${var.auth_exchange_active_requests_per_instance_critical} concurrent authentication exchanges for five minutes, immediately below the application-owned per-container limit. Inspect exchange latency, Redis subscription health, container distribution, and scaling. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}Container {{service.instance.id.name}} in ${var.environment} averaged more than ${var.auth_exchange_active_requests_per_instance_warning} concurrent authentication exchanges for five minutes. Investigate skew or sustained long-poll occupancy. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Authentication-exchange capacity recovered for container {{service.instance.id.name}} in ${var.environment}. Confirm exchange outcomes and latency are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  new_group_delay          = 300
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.auth_exchange_active_requests_per_instance_warning
    critical = var.auth_exchange_active_requests_per_instance_critical
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
    "signal:authentication",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "typed_server_errors" {
  name         = "[${upper(var.environment)}] Cataquí API typed server errors are elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_5m):sum:${var.api_error_count_metric_name}{${local.metric_scope},error_origin:server}.as_count() > ${var.server_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} emitted more than ${var.server_error_count_critical} typed server errors in five minutes. Current value: {{value}}. Group by stable error code and normalized route, then correlate the first increase with service.version. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} ${var.service_name} emitted more than ${var.server_error_count_warning} typed server errors in five minutes. Current value: {{value}}. Investigate stable codes before errors become widespread. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Typed server errors for ${var.environment} ${var.service_name} recovered. Confirm no new stable error code remains elevated. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.server_error_count_warning
    critical = var.server_error_count_critical
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
    "signal:errors",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "application_lifecycle_failures" {
  name         = "[${upper(var.environment)}] Cataquí API application lifecycle is failing"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${var.service_name} env:${var.environment} (*:\\\"api.application.start.failed\\\" OR *:\\\"api.telemetry.shutdown.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.runtime_failure_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API recorded more than ${var.runtime_failure_count_critical} fatal application-start or telemetry-shutdown failures in five minutes. Requests may never reach Nest or final telemetry may be incomplete. Inspect the privacy-safe error type and source frames, active release, container lifecycle, environment validation, and exporter health. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API recorded an application-start or telemetry-shutdown failure. Investigate immediately because request metrics may be absent or the final telemetry batch may be incomplete. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Application lifecycle failure signals recovered in ${var.environment}. Confirm a fresh container reaches READY and telemetry flushes during a controlled shutdown. ${local.alert_recovery_notification_routing}{{/is_recovery}}

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

resource "datadog_monitor" "rate_limit_enforcement_failures" {
  name         = "[${upper(var.environment)}] Cataquí API rate-limit enforcement backend is failing"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${var.service_name} env:${var.environment} *:\\\"api.rate_limit.enforcement.failed\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.rate_limit_enforcement_failure_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API failed closed while enforcing rate limits more than ${var.rate_limit_enforcement_failure_count_critical} times in five minutes. These requests return a typed 503 and are recorded as bad server-origin outcomes by the public HTTP availability metrics. Treat this as a user-visible backend availability incident and inspect Redis connectivity, the rate-limit operation, and the active release. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API failed closed while enforcing a rate limit. Inspect Redis connectivity and correlate affected normalized routes before rejections spread. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Rate-limit enforcement recovered in ${var.environment}. Confirm Redis operations, public request outcomes, and the availability SLO are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

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
    warning  = var.rate_limit_enforcement_failure_count_warning
    critical = var.rate_limit_enforcement_failure_count_critical
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
    "signal:availability",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "authentication_recovery_failures" {
  name         = "[${upper(var.environment)}] Cataquí authentication recovery is failing"
  type         = "log alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "logs(\"service:${var.service_name} env:${var.environment} (*:\\\"api.auth.notp.redis_scripts.preload_failed\\\" OR *:\\\"api.auth.notp.exchange.lease_acquisition_failed\\\" OR *:\\\"api.auth.notp.exchange.lease_cleanup_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_create_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_cleanup_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_readiness_timed_out\\\" OR *:\\\"api.auth.notp.verification.recovery_failed\\\" OR *:\\\"api.auth.session.persistence_compensation.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > ${var.authentication_recovery_failure_count_critical}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} API recorded more than ${var.authentication_recovery_failure_count_critical} authentication recovery failures in five minutes. Authentication state may be unavailable or uncertain after a Redis, subscription, cleanup, verification, or session-persistence failure. Inspect the exact bounded event and recovery outcome, then verify Redis and database consistency before retrying affected flows. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}The ${var.environment} API recorded an authentication recovery failure. Investigate the bounded event and recovery outcome before uncertain state accumulates. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Authentication recovery signals recovered in ${var.environment}. Confirm exchange, verification, and session persistence outcomes are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

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
    warning  = var.authentication_recovery_failure_count_warning
    critical = var.authentication_recovery_failure_count_critical
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
    "signal:authentication",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "failed_backend_operations" {
  name         = "[${upper(var.environment)}] Cataquí API backend operation failures by operation"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_10m):sum:${var.operation_count_metric_name}{${local.metric_scope},outcome:error} by {operation_name}.as_count() > ${var.operation_error_count_critical}"
  message      = <<-EOT
    {{#is_alert}}Backend operation {{operation_name.name}} in ${var.environment} exceeded ${var.operation_error_count_critical} failures in ten minutes. Current value: {{value}}. Check operation traces, provider/downstream health, and the active release. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}Backend operation {{operation_name.name}} in ${var.environment} exceeded ${var.operation_error_count_warning} failures in ten minutes. Current value: {{value}}. Investigate the bounded operation before retry or provider costs grow. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Backend operation {{operation_name.name}} in ${var.environment} recovered. Confirm its latency and provider response remain stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  new_group_delay          = 300
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.operation_error_count_warning
    critical = var.operation_error_count_critical
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
    "signal:operations",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "http_telemetry_silence" {
  name         = "[${upper(var.environment)}] Cataquí API HTTP telemetry is silent"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "sum(last_15m):sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope}}.as_count() < ${local.telemetry_silence_threshold}"
  message      = <<-EOT
    {{#is_alert}}The production ${var.service_name} recorded fewer than ${var.minimum_production_http_requests_per_15_minutes} completed requests in fifteen minutes. Current value: {{value}}. Determine whether this is a traffic outage, an exporter failure, or an invalid service/env tag. Staging uses a disabled threshold because idle periods are expected. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_no_data}}Datadog has received no ${var.http_request_count_metric_name} points for production ${var.service_name} for at least thirty minutes. Validate the runtime API key, managed-platform OTLP endpoint, delta temporality, exporter diagnostics, and recent deployment. ${local.nonpaging_notification_handles}{{/is_no_data}}
    {{#is_recovery}}HTTP telemetry for ${var.environment} ${var.service_name} resumed. Generate a controlled request and verify metrics, traces, and correlated logs all arrive with the expected service, env, and version tags. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  no_data_timeframe        = 30
  notification_preset_name = "hide_query_and_handles"
  notify_no_data           = var.environment == "production"
  priority                 = var.environment == "production" ? "1" : "3"
  renotify_interval        = 60
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    critical = local.telemetry_silence_threshold
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
    "signal:telemetry",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "event_loop_delay_p99" {
  name         = "[${upper(var.environment)}] Cataquí API event-loop delay is elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "avg(last_5m):avg:${var.event_loop_delay_p99_metric_name}{${local.metric_scope}} by {service.instance.id} > ${var.event_loop_delay_p99_critical_seconds}"
  message      = <<-EOT
    {{#is_alert}}A ${var.environment} ${var.service_name} container's Node.js p99 event-loop delay averaged above ${var.event_loop_delay_p99_critical_seconds}s for five minutes. Current value: {{value}}s. Inspect CPU-heavy work, synchronous operations, garbage collection, traffic, and active requests. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}A ${var.environment} ${var.service_name} container's Node.js p99 event-loop delay averaged above ${var.event_loop_delay_p99_warning_seconds}s for five minutes. Current value: {{value}}s. Investigate before HTTP latency rises. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Node.js event-loop delay for ${var.environment} ${var.service_name} recovered. Confirm HTTP latency and operation duration are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  new_group_delay          = 300
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.event_loop_delay_p99_warning_seconds
    critical = var.event_loop_delay_p99_critical_seconds
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
    "signal:runtime",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "event_loop_utilization" {
  name         = "[${upper(var.environment)}] Cataquí API event-loop utilization is saturated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "avg(last_5m):avg:${var.event_loop_utilization_metric_name}{${local.metric_scope}} by {service.instance.id} > ${var.event_loop_utilization_critical_ratio}"
  message      = <<-EOT
    {{#is_alert}}A ${var.environment} ${var.service_name} container's Node.js event-loop utilization averaged above ${var.event_loop_utilization_critical_ratio} for five minutes. Current ratio: {{value}}. Inspect CPU-bound work, request concurrency, and long synchronous tasks. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}A ${var.environment} ${var.service_name} container's Node.js event-loop utilization averaged above ${var.event_loop_utilization_warning_ratio} for five minutes. Current ratio: {{value}}. Investigate sustained pressure. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}Node.js event-loop utilization for ${var.environment} ${var.service_name} recovered. Confirm p99 delay and HTTP latency are stable. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  new_group_delay          = 300
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.event_loop_utilization_warning_ratio
    critical = var.event_loop_utilization_critical_ratio
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
    "signal:runtime",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "heap_pressure" {
  name         = "[${upper(var.environment)}] Cataquí API V8 heap pressure is elevated"
  type         = "metric alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "avg(last_5m):sum:${var.heap_used_metric_name}{${local.metric_scope}} by {service.instance.id} / sum:${var.heap_size_metric_name}{${local.metric_scope}} by {service.instance.id} * 100 > ${var.heap_pressure_critical_percent}"
  message      = <<-EOT
    {{#is_alert}}A ${var.environment} ${var.service_name} container's V8 heap-used ratio exceeded ${var.heap_pressure_critical_percent}% for five minutes. Current value: {{value}}%. Inspect heap growth, garbage-collection pauses, workload concurrency, and release-specific regressions. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_warning}}A ${var.environment} ${var.service_name} container's V8 heap-used ratio exceeded ${var.heap_pressure_warning_percent}% for five minutes. Current value: {{value}}%. Investigate sustained memory pressure. ${local.nonpaging_notification_handles}{{/is_warning}}
    {{#is_recovery}}V8 heap pressure for ${var.environment} ${var.service_name} recovered. Confirm heap use does not continue trending upward across traffic cycles. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  evaluation_delay         = 60
  include_tags             = true
  new_group_delay          = 300
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  require_full_window      = false
  validate                 = true

  monitor_thresholds {
    warning  = var.heap_pressure_warning_percent
    critical = var.heap_pressure_critical_percent
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
    "signal:runtime",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "availability_fast_burn" {
  name         = "[${upper(var.environment)}] Cataquí API container-handled availability SLO fast burn"
  type         = "slo alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "burn_rate(\"${datadog_service_level_objective.api_availability.id}\").over(\"30d\").long_window(\"1h\").short_window(\"5m\") > ${var.fast_burn_rate_threshold}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} 30-day container-handled availability SLO is burning error budget above ${var.fast_burn_rate_threshold}x across both the one-hour and five-minute windows. Start incident response now and check the independent Worker edge monitors for failures outside this SLI. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_recovery}}The fast availability burn for ${var.environment} ${var.service_name} recovered. Continue incident response until the underlying failure is understood and the slow-burn monitor is healthy. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "1"
  renotify_interval        = 30
  renotify_occurrences     = 5
  renotify_statuses        = ["alert"]
  validate                 = true

  monitor_thresholds {
    critical = var.fast_burn_rate_threshold
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
    "signal:slo_burn",
    "team:${var.team_name}",
  ]
}

resource "datadog_monitor" "availability_slow_burn" {
  name         = "[${upper(var.environment)}] Cataquí API container-handled availability SLO slow burn"
  type         = "slo alert"
  draft_status = var.runtime_telemetry_enabled ? "published" : "draft"
  query        = "burn_rate(\"${datadog_service_level_objective.api_availability.id}\").over(\"30d\").long_window(\"6h\").short_window(\"30m\") > ${var.slow_burn_rate_threshold}"
  message      = <<-EOT
    {{#is_alert}}The ${var.environment} ${var.service_name} 30-day container-handled availability SLO is burning error budget above ${var.slow_burn_rate_threshold}x across both the six-hour and thirty-minute windows. Investigate before the monthly objective is exhausted and check the independent Worker edge monitors. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_recovery}}The slow availability burn for ${var.environment} ${var.service_name} recovered. Confirm the 30-day budget projection is acceptable and record the remediation. ${local.alert_recovery_notification_routing}{{/is_recovery}}

    Runbook: ${var.runbook_url}
  EOT

  include_tags             = true
  notification_preset_name = "hide_query_and_handles"
  priority                 = "2"
  renotify_interval        = 120
  renotify_occurrences     = 3
  renotify_statuses        = ["alert"]
  validate                 = true

  monitor_thresholds {
    critical = var.slow_burn_rate_threshold
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
    "signal:slo_burn",
    "team:${var.team_name}",
  ]
}
