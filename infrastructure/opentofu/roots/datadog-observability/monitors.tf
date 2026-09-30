# API monitors. Request monitors use the trace metrics Datadog APM computes from every request span
# (trace.http.server.request.*); log monitors search the attributes the API writes on its logs.

resource "datadog_monitor" "api_server_errors" {
  name    = "[${var.environment}] Cataquí API returns 5xx errors"
  type    = "query alert"
  query   = "sum(last_10m):sum:trace.http.server.request.errors{${local.metric_scope}}.as_count() > 5"
  message = <<-EOT
    The Cataquí API answered more than 5 requests with a 5xx status in the last 10 minutes.
    Open APM Error Tracking for service ${local.service} in ${var.environment} to see the failing endpoints and stack traces.
    ${local.notify}
  EOT

  monitor_thresholds {
    critical = 5
    warning  = 1
  }

  require_full_window = false
  tags                = local.tags
}

resource "datadog_monitor" "api_slow_requests" {
  name    = "[${var.environment}] Cataquí API responds slowly"
  type    = "query alert"
  query   = "percentile(last_15m):p95:trace.http.server.request{${local.metric_scope}} > 3"
  message = <<-EOT
    The 95th percentile API response time was above 3 seconds for the last 15 minutes.
    Open the slowest traces for service ${local.service} in ${var.environment}; the spans show whether the database, Redis, or an AI call is the cause.
    ${local.notify}
  EOT

  monitor_thresholds {
    critical = 3
    warning  = 1.5
  }

  require_full_window = false
  tags                = local.tags
}

resource "datadog_monitor" "api_error_logs" {
  name    = "[${var.environment}] Cataquí API logs many errors"
  type    = "log alert"
  query   = "logs(\"${local.scope} status:error\").index(\"*\").rollup(\"count\").last(\"15m\") > 10"
  message = <<-EOT
    The Cataquí API wrote more than 10 error logs in the last 15 minutes.
    Each log links to the trace of the request that produced it.
    ${local.notify}
  EOT

  monitor_thresholds {
    critical = 10
  }

  enable_logs_sample = true
  tags               = local.tags
}

resource "datadog_monitor" "api_crashed" {
  name    = "[${var.environment}] Cataquí API crashed or failed to start"
  type    = "log alert"
  query   = "logs(\"${local.scope} @event:(api.process.crashed OR api.application.start.failed)\").index(\"*\").rollup(\"count\").last(\"5m\") > 0"
  message = <<-EOT
    The Cataquí API process crashed or could not start. The container restarts it, but repeated alerts mean requests are failing.
    The log contains the error type, message, and stack.
    ${local.notify}
  EOT

  monitor_thresholds {
    critical = 0
  }

  enable_logs_sample = true
  tags               = local.tags
}

resource "datadog_monitor" "api_event_loop_blocked" {
  name    = "[${var.environment}] Cataquí API event loop is blocked"
  type    = "metric alert"
  query   = "max(last_10m):max:nodejs.eventloop.delay.p99{${local.metric_scope}} > 1"
  message = <<-EOT
    The Node.js event loop of the Cataquí API was delayed by more than 1 second. Every request waits while it is blocked.
    Look for synchronous CPU-heavy work or very large payloads in the slow traces from the same time.
    ${local.notify}
  EOT

  monitor_thresholds {
    critical = 1
    warning  = 0.5
  }

  require_full_window = false
  tags                = local.tags
}
