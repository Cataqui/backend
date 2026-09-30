mock_provider "datadog" {}

run "staging_scope" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = alltrue([
      for monitor in [
        datadog_monitor.api_server_errors,
        datadog_monitor.api_slow_requests,
        datadog_monitor.api_error_logs,
        datadog_monitor.api_crashed,
        datadog_monitor.api_event_loop_blocked,
      ] : strcontains(monitor.query, "env:staging") && !strcontains(monitor.query, "env:production") && contains(monitor.tags, "env:staging")
    ])
    error_message = "Staging monitors must only watch and be tagged with the staging environment."
  }

  assert {
    condition     = datadog_synthetics_test.api_health.request_definition[0].url == "https://staging.api.cataqui.com/v1/health"
    error_message = "The staging health check must call the staging API."
  }
}

run "production_scope" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = datadog_synthetics_test.api_health.request_definition[0].url == "https://api.cataqui.com/v1/health"
    error_message = "The production health check must call the production API."
  }

  assert {
    condition     = datadog_synthetics_test.api_health.options_list[0].tick_every == 300
    error_message = "Production must be checked every five minutes."
  }

  assert {
    condition     = strcontains(datadog_monitor.api_server_errors.query, "service:cataqui-api,env:production")
    error_message = "Production monitors must watch the production API service."
  }
}

run "monitor_contract" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      strcontains(datadog_monitor.api_crashed.query, "api.process.crashed") &&
      strcontains(datadog_monitor.api_crashed.query, "api.application.start.failed")
    )
    error_message = "The crash monitor must match the lifecycle events the API logs when it crashes or fails to start."
  }

  assert {
    condition     = strcontains(datadog_monitor.api_slow_requests.query, "p95:trace.http.server.request")
    error_message = "The latency monitor must use the p95 of API request spans."
  }
}

run "dashboard_is_valid_json" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = jsondecode(datadog_dashboard_json.api.dashboard).title == "Cataquí API (staging)"
    error_message = "The dashboard template must render valid JSON titled for its environment."
  }

  assert {
    condition     = !strcontains(datadog_dashboard_json.api.dashboard, "production")
    error_message = "The staging dashboard must not query production data."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
