# Checks from outside Cloudflare that the API answers and that its database and Redis checks pass.
resource "datadog_synthetics_test" "api_health" {
  name      = "[${var.environment}] Cataquí API health"
  type      = "api"
  subtype   = "http"
  status    = "live"
  locations = ["aws:sa-east-1"]
  message   = <<-EOT
    https://${local.settings.api_host}/v1/health did not return 200 from São Paulo.
    The API is unreachable or its database or Redis check is failing.
    ${local.notify}
  EOT

  request_definition {
    method = "GET"
    url    = "https://${local.settings.api_host}/v1/health"
  }

  assertion {
    type     = "statusCode"
    operator = "is"
    target   = "200"
  }

  assertion {
    type     = "responseTime"
    operator = "lessThan"
    target   = "5000"
  }

  options_list {
    tick_every           = local.settings.health_check_interval_seconds
    min_location_failed  = 1
    min_failure_duration = 300

    retry {
      count    = 2
      interval = 30000
    }
  }

  tags = local.tags
}
