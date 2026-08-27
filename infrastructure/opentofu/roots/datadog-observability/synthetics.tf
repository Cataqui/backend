resource "datadog_synthetics_test" "api_health" {
  count = var.enable_synthetics ? 1 : 0

  name      = "Cataquí API ${var.environment} public health"
  type      = "api"
  subtype   = "http"
  status    = var.runtime_telemetry_enabled ? "live" : "paused"
  locations = sort(tolist(var.synthetics_locations))
  message   = <<-EOT
    {{#is_alert}}The public ${var.environment} ${var.service_name} dependency health endpoint is unavailable or too slow. Follow ${var.runbook_url}. ${local.critical_incident_notification_handles}{{/is_alert}}
    {{#is_recovery}}The public ${var.environment} ${var.service_name} dependency health endpoint recovered. Follow ${var.runbook_url}. ${local.alert_recovery_notification_routing}{{/is_recovery}}
  EOT

  request_definition {
    method                  = "GET"
    url                     = local.health_check_url
    timeout                 = 10
    no_saving_response_body = true
  }

  request_headers = {
    Accept = "application/json"
  }

  assertion {
    type     = "statusCode"
    operator = "is"
    target   = "200"
  }

  assertion {
    type          = "responseTime"
    operator      = "lessThan"
    target        = tostring(var.synthetics_response_time_critical_milliseconds)
    timings_scope = "withoutDNS"
  }

  options_list {
    accept_self_signed                = false
    allow_insecure                    = false
    check_certificate_revocation      = true
    follow_redirects                  = false
    min_failure_duration              = 60
    min_location_failed               = length(var.synthetics_locations)
    tick_every                        = var.synthetics_tick_every_seconds
    disable_aia_intermediate_fetching = false

    retry {
      count    = 2
      interval = 5000
    }

    monitor_options {
      renotify_interval        = 60
      renotify_occurrences     = 3
      notification_preset_name = "hide_query_and_handles"
    }
  }

  tags = [
    "env:${var.environment}",
    "managed_by:opentofu",
    "service:${var.service_name}",
    "signal:synthetic",
    "team:${var.team_name}",
  ]
}
