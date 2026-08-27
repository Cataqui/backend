mock_provider "datadog" {}

variables {
  datadog_organization_id        = "00000000-0000-4000-8000-000000000001"
  environment                    = "staging"
  nonpaging_notification_handles = ["@slack-backend-alerts"]
  observability_editor_role_ids  = ["00000000-0000-4000-8000-000000000000"]
  pager_notification_handles     = []
  runtime_telemetry_enabled      = true
}

override_resource {
  target = datadog_service_level_objective.api_availability
  values = {
    id = "availability-slo-id"
  }
}

override_resource {
  target = datadog_dashboard.service_health
  values = {
    id  = "service-health-dashboard-id"
    url = "https://app.datadoghq.com/dashboard/service-health-dashboard-id"
  }
}

override_resource {
  target = datadog_dashboard.product_and_runtime
  values = {
    id  = "product-runtime-dashboard-id"
    url = "https://app.datadoghq.com/dashboard/product-runtime-dashboard-id"
  }
}

override_resource {
  target = datadog_dashboard.ingress_and_authentication
  values = {
    id  = "ingress-authentication-dashboard-id"
    url = "https://app.datadoghq.com/dashboard/ingress-authentication-dashboard-id"
  }
}

override_resource {
  target = datadog_synthetics_test.api_health
  values = {
    id         = "synthetic-public-id"
    monitor_id = 123456
  }
}

run "default_metric_names_match_the_runtime_contract" {
  command = plan

  assert {
    condition = output.metric_contract == {
      active_http_requests        = "cataqui.api.http.server.active_requests"
      api_error_count             = "cataqui.api.error.count"
      cloudflare_worker_errors    = "cloudflare.workers.requests.errors"
      cloudflare_worker_p99       = "cloudflare.workers.response_time.99p"
      cloudflare_worker_requests  = "cloudflare.workers.requests.all"
      event_loop_delay_p99        = "nodejs.eventloop.delay.p99"
      event_loop_utilization      = "nodejs.eventloop.utilization"
      garbage_collection_duration = "v8js.gc.duration"
      heap_size                   = "v8js.memory.heap.space.size"
      heap_used                   = "v8js.memory.heap.used"
      http_request_count          = "cataqui.api.http.server.request.count"
      http_request_duration       = "cataqui.api.http.server.request.duration"
      operation_count             = "cataqui.api.operation.count"
      operation_duration          = "cataqui.api.operation.duration"
      product_event_count         = "cataqui.api.product.event.count"
    }
    error_message = "OpenTofu must query the exact application and Node.js runtime metric contract."
  }
}

run "all_dashboards_are_environment_scoped_and_edit_restricted" {
  command = plan

  assert {
    condition = (
      datadog_dashboard.service_health.title == "Cataquí API | Staging | Service health" &&
      datadog_dashboard.service_health.restricted_roles == toset(["00000000-0000-4000-8000-000000000000"]) &&
      datadog_dashboard.service_health.tags == tolist(["team:backend"]) &&
      datadog_dashboard.ingress_and_authentication.title == "Cataquí API | Staging | Ingress and authentication" &&
      datadog_dashboard.ingress_and_authentication.restricted_roles == toset(["00000000-0000-4000-8000-000000000000"]) &&
      datadog_dashboard.ingress_and_authentication.tags == tolist(["team:backend"]) &&
      datadog_dashboard.product_and_runtime.title == "Cataquí API | Staging | Product and runtime deep dive" &&
      datadog_dashboard.product_and_runtime.restricted_roles == toset(["00000000-0000-4000-8000-000000000000"]) &&
      datadog_dashboard.product_and_runtime.tags == tolist(["team:backend"])
    )
    error_message = "Every dashboard must identify staging, remain owned by the backend team, and restrict editing to the attached role."
  }
}

run "managed_monitors_and_slo_are_edit_restricted" {
  command = plan

  assert {
    condition = (
      length(module.monitor_restriction_policy) == 28 &&
      alltrue([
        for policy in values(module.monitor_restriction_policy) :
        policy.bindings.editors == toset(["role:00000000-0000-4000-8000-000000000000"]) &&
        policy.bindings.viewers == toset(["org:00000000-0000-4000-8000-000000000001"])
      ]) &&
      module.availability_slo_restriction_policy.bindings.editors == toset(["role:00000000-0000-4000-8000-000000000000"]) &&
      module.availability_slo_restriction_policy.bindings.viewers == toset(["org:00000000-0000-4000-8000-000000000001"])
    )
    error_message = "Every managed monitor and the availability SLO must retain organization viewer access while restricting editing to the declared observability editor roles."
  }
}

run "service_health_dashboard_uses_release_and_normalized_route_filters" {
  command = plan

  assert {
    condition = datadog_dashboard.service_health.widget[3].query_value_definition[0].request[0].q == (
      "sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,version:$service_version,http_route:$http_route}.as_count()"
    )
    error_message = "The service-health dashboard must filter request metrics by immutable release and normalized route."
  }
}

run "product_dashboard_groups_only_registered_successful_api_requests" {
  command = plan

  assert {
    condition = (
      datadog_dashboard.product_and_runtime.widget[1].query_value_definition[0].title == "Successful product API requests (24h)" &&
      datadog_dashboard.product_and_runtime.widget[2].timeseries_definition[0].title == "Successful product API requests" &&
      datadog_dashboard.product_and_runtime.widget[2].timeseries_definition[0].request[0].q == "sum:cataqui.api.product.event.count{service:cataqui-api,env:staging,version:$service_version} by {product_event}.as_count()" &&
      datadog_dashboard.product_and_runtime.widget[3].toplist_definition[0].title == "Top successful product API requests" &&
      datadog_dashboard.product_and_runtime.widget[11].log_stream_definition[0].title == "Recent container failure logs" &&
      datadog_dashboard.product_and_runtime.widget[11].log_stream_definition[0].query == "service:cataqui-api env:staging version:$service_version (status:error OR *:\"api.application.start.failed\" OR *:\"api.telemetry.shutdown.failed\")"
    )
    error_message = "The product dashboard must describe successful API request outcomes accurately and group the bounded product-event dimension without adding identifiers."
  }
}

run "http_error_rate_monitor_uses_a_sustained_request_based_ratio" {
  command = plan

  assert {
    condition = datadog_monitor.http_server_error_rate.query == (
      "sum(last_5m):sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,availability_outcome:bad}.as_count() / sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,!availability_outcome:excluded}.as_count() * 100 > 5"
    )
    error_message = "The server-error monitor must evaluate bad outcomes over non-aborted application-owned requests for five minutes."
  }
}

run "standard_public_latency_excludes_client_aborts_and_authentication_long_polling" {
  command = plan

  assert {
    condition = (
      datadog_monitor.http_latency_p95.query == "percentile(last_5m):p95:cataqui.api.http.server.request.duration{service:cataqui-api,env:staging,traffic_surface:public_api,!http_route:/v1/auth/notp/intents/exchange,!availability_outcome:excluded} > 1.5" &&
      datadog_dashboard.service_health.widget[5].query_value_definition[0].request[0].q == "p95:cataqui.api.http.server.request.duration{service:cataqui-api,env:staging,traffic_surface:public_api,!http_route:/v1/auth/notp/intents/exchange,version:$service_version,http_route:$http_route,!availability_outcome:excluded}" &&
      datadog_dashboard.service_health.widget[7].timeseries_definition[0].request[0].q == "p95:cataqui.api.http.server.request.duration{service:cataqui-api,env:staging,traffic_surface:public_api,!http_route:/v1/auth/notp/intents/exchange,version:$service_version,http_route:$http_route,!availability_outcome:excluded} by {http_route}"
    )
    error_message = "Standard public latency must exclude client-aborted requests and the intentional authentication long poll from monitor and dashboard percentiles."
  }
}

run "authentication_exchange_has_dedicated_latency_outcome_and_per_instance_capacity_coverage" {
  command = plan

  assert {
    condition = (
      datadog_monitor.active_http_requests.query == "avg(last_5m):sum:cataqui.api.http.server.active_requests{service:cataqui-api,env:staging,!http_route:/v1/auth/notp/intents/exchange} > 500" &&
      datadog_dashboard.service_health.widget[9].timeseries_definition[0].title == "Active HTTP requests excluding auth exchange" &&
      datadog_dashboard.service_health.widget[9].timeseries_definition[0].request[0].q == "sum:cataqui.api.http.server.active_requests{service:cataqui-api,env:staging,!http_route:/v1/auth/notp/intents/exchange,version:$service_version}" &&
      datadog_monitor.auth_exchange_latency_p95.query == "percentile(last_5m):p95:cataqui.api.http.server.request.duration{service:cataqui-api,env:staging,traffic_surface:public_api,http_route:/v1/auth/notp/intents/exchange,!availability_outcome:excluded} > 25" &&
      datadog_monitor.auth_exchange_active_requests_per_instance.query == "avg(last_5m):max:cataqui.api.http.server.active_requests{service:cataqui-api,env:staging,traffic_surface:public_api,http_route:/v1/auth/notp/intents/exchange} by {service.instance.id} > 24" &&
      datadog_monitor.auth_exchange_active_requests_per_instance.new_group_delay == 300 &&
      datadog_dashboard.ingress_and_authentication.widget[3].timeseries_definition[0].title == "Authentication exchange latency" &&
      length(datadog_dashboard.ingress_and_authentication.widget[3].timeseries_definition[0].request) == 3 &&
      datadog_dashboard.ingress_and_authentication.widget[4].timeseries_definition[0].request[0].q == "sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,http_route:/v1/auth/notp/intents/exchange,version:$service_version} by {outcome,status_code}.as_count()" &&
      datadog_dashboard.ingress_and_authentication.widget[5].timeseries_definition[0].request[0].q == "max:cataqui.api.http.server.active_requests{service:cataqui-api,env:staging,traffic_surface:public_api,http_route:/v1/auth/notp/intents/exchange,version:$service_version} by {service.instance.id}"
    )
    error_message = "Authentication exchange must retain its own long-poll latency percentiles, bounded outcomes, and per-container capacity signal."
  }
}

run "every_monitor_has_routing_ownership_and_management_tags" {
  command = plan

  assert {
    condition = alltrue([
      for monitor in [
        datadog_monitor.active_http_requests,
        datadog_monitor.application_lifecycle_failures,
        datadog_monitor.auth_exchange_active_requests_per_instance,
        datadog_monitor.auth_exchange_latency_p95,
        datadog_monitor.authentication_recovery_failures,
        datadog_monitor.availability_fast_burn,
        datadog_monitor.availability_slow_burn,
        datadog_monitor.cloudflare_worker_errors,
        datadog_monitor.container_runtime_failures,
        datadog_monitor.event_loop_delay_p99,
        datadog_monitor.event_loop_utilization,
        datadog_monitor.failed_backend_operations,
        datadog_monitor.geosearch_cloudflare_worker_errors,
        datadog_monitor.geosearch_provider_failures,
        datadog_monitor.geosearch_request_failures,
        datadog_monitor.heap_pressure,
        datadog_monitor.http_latency_p95,
        datadog_monitor.http_server_error_rate,
        datadog_monitor.http_telemetry_silence,
        datadog_monitor.rate_limit_enforcement_failures,
        datadog_monitor.typed_server_errors,
        datadog_monitor.webhooks_cloudflare_worker_errors,
        datadog_monitor.webhooks_inbound_delivery_failures,
        datadog_monitor.webhooks_request_failures,
        datadog_monitor.worker_edge_handoff_failures,
        datadog_monitor.worker_inbound_call_failures,
        datadog_monitor.worker_outbound_call_failures,
        datadog_monitor.worker_queue_retries,
        ] : (
        strcontains(monitor.message, "@slack-backend-alerts") &&
        length(monitor.assets) == 1 &&
        contains(monitor.tags, "env:staging") &&
        contains(monitor.tags, "managed_by:opentofu") &&
        contains(monitor.tags, "service:cataqui-api") &&
        contains(monitor.tags, "team:backend") &&
        monitor.draft_status == "published" &&
        monitor.validate == true
      )
    ])
    error_message = "Every managed monitor must route notifications, link the runbook, and carry environment, service, team, and OpenTofu ownership tags."
  }
}

run "availability_slo_uses_good_requests_over_non_aborted_requests" {
  command = plan

  assert {
    condition = (
      datadog_service_level_objective.api_availability.query[0].numerator == "sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,availability_outcome:good}.as_count()" &&
      datadog_service_level_objective.api_availability.query[0].denominator == "sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api,!availability_outcome:excluded}.as_count()" &&
      datadog_service_level_objective.api_availability.name == "Cataquí API staging container-handled request availability" &&
      length(datadog_service_level_objective.api_availability.thresholds) == 3 &&
      datadog_service_level_objective.api_availability.target_threshold == 99.9 &&
      datadog_service_level_objective.api_availability.warning_threshold == 99.95 &&
      datadog_service_level_objective.api_availability.validate == true
    )
    error_message = "The container-handled availability SLO must use good public outcomes over non-aborted public requests across three windows with the declared targets."
  }
}

run "staging_telemetry_silence_policy_is_idle_safe" {
  command = plan

  assert {
    condition = (
      datadog_monitor.http_telemetry_silence.query == "sum(last_15m):sum:cataqui.api.http.server.request.count{service:cataqui-api,env:staging,traffic_surface:public_api}.as_count() < -1" &&
      datadog_monitor.http_telemetry_silence.notify_no_data == false &&
      datadog_monitor.http_telemetry_silence.no_data_timeframe == 30 &&
      datadog_monitor.http_telemetry_silence.priority == "3"
    )
    error_message = "Idle staging must not alert or page on traffic silence, while retaining a monitor with a no-data window at least twice its query window."
  }
}

run "edge_and_runtime_availability_monitors_cover_every_pre_sli_failure_boundary" {
  command = plan

  assert {
    condition = (
      datadog_monitor.worker_edge_handoff_failures.type == "log alert" &&
      datadog_monitor.worker_edge_handoff_failures.query == "logs(\"service:cataqui-api-staging (*:\\\"api.worker.request.rejected\\\" OR *:\\\"api.worker.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      !strcontains(datadog_monitor.worker_edge_handoff_failures.query, "env:") &&
      !strcontains(datadog_monitor.worker_edge_handoff_failures.query, "@event:") &&
      datadog_monitor.worker_edge_handoff_failures.enable_logs_sample == false &&
      datadog_monitor.container_runtime_failures.query == "logs(\"service:cataqui-api-staging (*:\\\"api.container.runtime.failed\\\" OR *:\\\"api.container.stopped.unexpected\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.container_runtime_failures.enable_logs_sample == false &&
      datadog_monitor.application_lifecycle_failures.query == "logs(\"service:cataqui-api env:staging (*:\\\"api.application.start.failed\\\" OR *:\\\"api.telemetry.shutdown.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.application_lifecycle_failures.enable_logs_sample == false &&
      datadog_monitor.cloudflare_worker_errors.query == "sum(last_10m):sum:cloudflare.workers.requests.errors{script_name:cataqui-api-staging}.as_count() > 2" &&
      datadog_monitor.cloudflare_worker_errors.evaluation_delay == 300
    )
    error_message = "Edge and runtime availability must cover returned public failures, thrown handoffs, idle container failures, application lifecycle failures, and the independent Cloudflare platform signal without assuming parsed Worker attributes."
  }
}

run "direct_inbound_webhooks_and_geosearch_have_exact_platform_lifecycle_and_delivery_coverage" {
  command = plan

  assert {
    condition = (
      datadog_monitor.worker_inbound_call_failures.query == "logs(\"service:cataqui-api-staging (*:\\\"api.worker.inbound.call.rejected\\\" OR *:\\\"api.worker.inbound.call.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.worker_inbound_call_failures.enable_logs_sample == false &&
      datadog_monitor.worker_outbound_call_failures.query == "logs(\"service:cataqui-api-staging (*:\\\"api.worker.outbound.call.rejected\\\" OR *:\\\"api.worker.outbound.call.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.worker_outbound_call_failures.enable_logs_sample == false &&
      datadog_monitor.webhooks_cloudflare_worker_errors.query == "sum(last_10m):sum:cloudflare.workers.requests.errors{script_name:cataqui-webhooks-staging}.as_count() > 2" &&
      datadog_monitor.webhooks_cloudflare_worker_errors.evaluation_delay == 300 &&
      datadog_monitor.webhooks_request_failures.query == "logs(\"service:cataqui-webhooks-staging (*:\\\"webhooks.request.rejected\\\" OR *:\\\"webhooks.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.webhooks_request_failures.enable_logs_sample == false &&
      datadog_monitor.webhooks_inbound_delivery_failures.query == "logs(\"service:cataqui-webhooks-staging *:\\\"webhooks.api.inbound.delivery.rejected\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.webhooks_inbound_delivery_failures.enable_logs_sample == false &&
      datadog_monitor.geosearch_cloudflare_worker_errors.query == "sum(last_10m):sum:cloudflare.workers.requests.errors{script_name:cataqui-geosearch-staging}.as_count() > 2" &&
      datadog_monitor.geosearch_cloudflare_worker_errors.evaluation_delay == 300 &&
      datadog_monitor.geosearch_request_failures.query == "logs(\"service:cataqui-geosearch-staging *:\\\"geosearch.request.failed\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      !strcontains(datadog_monitor.geosearch_request_failures.query, "geosearch.request.rejected") &&
      datadog_monitor.geosearch_request_failures.enable_logs_sample == false &&
      datadog_monitor.geosearch_provider_failures.query == "logs(\"service:cataqui-geosearch-staging (*:\\\"geosearch.provider.request.rejected\\\" OR *:\\\"geosearch.provider.request.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.geosearch_provider_failures.enable_logs_sample == false
    )
    error_message = "Direct API inbound, Webhooks ingress, and Geosearch must cover exact rejected and failed lifecycle contracts without duplicate alerts or embedded raw log samples."
  }

  assert {
    condition = (
      datadog_dashboard.ingress_and_authentication.widget[1].timeseries_definition[0].request[0].q == "sum:cloudflare.workers.requests.all{script_name:cataqui-api-staging}.as_count()" &&
      datadog_dashboard.ingress_and_authentication.widget[1].timeseries_definition[0].request[1].q == "sum:cloudflare.workers.requests.all{script_name:cataqui-webhooks-staging}.as_count()" &&
      datadog_dashboard.ingress_and_authentication.widget[1].timeseries_definition[0].request[2].q == "sum:cloudflare.workers.requests.all{script_name:cataqui-geosearch-staging}.as_count()" &&
      datadog_dashboard.ingress_and_authentication.widget[2].timeseries_definition[0].request[0].q == "avg:cloudflare.workers.response_time.99p{script_name:cataqui-api-staging}" &&
      datadog_dashboard.ingress_and_authentication.widget[2].timeseries_definition[0].request[1].q == "avg:cloudflare.workers.response_time.99p{script_name:cataqui-webhooks-staging}" &&
      datadog_dashboard.ingress_and_authentication.widget[2].timeseries_definition[0].request[2].q == "avg:cloudflare.workers.response_time.99p{script_name:cataqui-geosearch-staging}" &&
      datadog_dashboard.ingress_and_authentication.widget[7].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-webhooks-staging *:\"webhooks.request.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[7].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-webhooks-staging *:\"webhooks.request.rejected\"" &&
      datadog_dashboard.ingress_and_authentication.widget[7].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-webhooks-staging *:\"webhooks.request.failed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[8].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-webhooks-staging *:\"webhooks.api.inbound.delivery.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[8].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-webhooks-staging *:\"webhooks.api.inbound.delivery.rejected\"" &&
      length(datadog_dashboard.ingress_and_authentication.widget[8].timeseries_definition[0].request) == 2 &&
      datadog_dashboard.ingress_and_authentication.widget[9].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.outbound.call.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[9].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.outbound.call.rejected\"" &&
      datadog_dashboard.ingress_and_authentication.widget[9].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.outbound.call.failed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[10].timeseries_definition[0].title == "Authentication exchange wait and recovery outcomes" &&
      length(datadog_dashboard.ingress_and_authentication.widget[10].timeseries_definition[0].request) == 6 &&
      datadog_dashboard.ingress_and_authentication.widget[11].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-api env:staging (*:\"api.auth.notp.verification.completed\" AND *:\"VERIFIED\")" &&
      datadog_dashboard.ingress_and_authentication.widget[11].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-api env:staging (*:\"api.auth.notp.verification.completed\" AND *:\"NO_MATCH\")" &&
      strcontains(datadog_dashboard.ingress_and_authentication.widget[12].log_stream_definition[0].query, "api.worker.outbound.call.rejected") &&
      strcontains(datadog_dashboard.ingress_and_authentication.widget[12].log_stream_definition[0].query, "api.worker.queue.delivery.failed") &&
      strcontains(datadog_dashboard.ingress_and_authentication.widget[12].log_stream_definition[0].query, "api.worker.queue.batch.failed") &&
      strcontains(datadog_dashboard.ingress_and_authentication.widget[12].log_stream_definition[0].query, "webhooks.request.rejected") &&
      strcontains(datadog_dashboard.ingress_and_authentication.widget[12].log_stream_definition[0].query, "geosearch.provider.request.rejected") &&
      datadog_dashboard.ingress_and_authentication.widget[13].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-geosearch-staging *:\"geosearch.request.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[13].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-geosearch-staging *:\"geosearch.request.rejected\"" &&
      datadog_dashboard.ingress_and_authentication.widget[13].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-geosearch-staging *:\"geosearch.request.failed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[14].timeseries_definition[0].request[0].log_query[0].compute_query[0].aggregation == "avg" &&
      datadog_dashboard.ingress_and_authentication.widget[14].timeseries_definition[0].request[0].log_query[0].compute_query[0].facet == "@durationMilliseconds" &&
      datadog_dashboard.ingress_and_authentication.widget[14].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-geosearch-staging (*:\"geosearch.provider.request.completed\" OR *:\"geosearch.provider.request.rejected\" OR *:\"geosearch.provider.request.failed\")" &&
      datadog_dashboard.ingress_and_authentication.widget[15].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.inbound.call.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[15].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.inbound.call.rejected\"" &&
      datadog_dashboard.ingress_and_authentication.widget[15].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.inbound.call.failed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[16].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.queue.delivery.completed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[16].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.queue.delivery.rejected\"" &&
      datadog_dashboard.ingress_and_authentication.widget[16].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.queue.delivery.failed\"" &&
      datadog_dashboard.ingress_and_authentication.widget[17].timeseries_definition[0].request[0].log_query[0].search_query == "service:cataqui-api-staging (*:\"api.worker.queue.batch.completed\" AND *:\"SUCCESS\")" &&
      datadog_dashboard.ingress_and_authentication.widget[17].timeseries_definition[0].request[1].log_query[0].search_query == "service:cataqui-api-staging (*:\"api.worker.queue.batch.completed\" AND *:\"RETRY_SCHEDULED\")" &&
      datadog_dashboard.ingress_and_authentication.widget[17].timeseries_definition[0].request[2].log_query[0].search_query == "service:cataqui-api-staging *:\"api.worker.queue.batch.failed\"" &&
      length(datadog_dashboard.ingress_and_authentication.widget) == 18
    )
    error_message = "The ingress dashboard must compare all three Cloudflare Workers and preserve every exact Webhooks, Geosearch, and delivery event."
  }
}

run "rate_limit_enforcement_backend_failures_alert_outside_the_http_availability_classification" {
  command = plan

  assert {
    condition = (
      datadog_monitor.rate_limit_enforcement_failures.type == "log alert" &&
      datadog_monitor.rate_limit_enforcement_failures.query == "logs(\"service:cataqui-api env:staging *:\\\"api.rate_limit.enforcement.failed\\\"\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.rate_limit_enforcement_failures.enable_logs_sample == false &&
      datadog_monitor.rate_limit_enforcement_failures.priority == "1"
    )
    error_message = "Fail-closed Redis rate-limit enforcement failures must alert explicitly alongside their typed 503 bad outcome in the public HTTP availability SLI."
  }
}

run "authentication_recovery_failures_alert_on_uncertain_exchange_verification_and_session_state" {
  command = plan

  assert {
    condition = (
      datadog_monitor.authentication_recovery_failures.type == "log alert" &&
      datadog_monitor.authentication_recovery_failures.query == "logs(\"service:cataqui-api env:staging (*:\\\"api.auth.notp.redis_scripts.preload_failed\\\" OR *:\\\"api.auth.notp.exchange.lease_acquisition_failed\\\" OR *:\\\"api.auth.notp.exchange.lease_cleanup_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_create_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_cleanup_failed\\\" OR *:\\\"api.auth.notp.exchange.subscription_readiness_timed_out\\\" OR *:\\\"api.auth.notp.verification.recovery_failed\\\" OR *:\\\"api.auth.session.persistence_compensation.failed\\\")\").index(\"*\").rollup(\"count\").last(\"5m\") > 2" &&
      datadog_monitor.authentication_recovery_failures.enable_logs_sample == false &&
      datadog_monitor.authentication_recovery_failures.priority == "1"
    )
    error_message = "Authentication recovery alerting must cover Redis setup, long-poll coordination, verification compensation, and session-persistence compensation failures."
  }
}

run "queue_monitor_pages_on_failed_or_retrying_batches_without_log_samples" {
  command = plan

  assert {
    condition = (
      datadog_monitor.worker_queue_retries.type == "log alert" &&
      datadog_monitor.worker_queue_retries.query == "logs(\"service:cataqui-api-staging (*:\\\"api.worker.queue.batch.failed\\\" OR (*:\\\"api.worker.queue.batch.completed\\\" AND *:\\\"RETRY_SCHEDULED\\\"))\").index(\"*\").rollup(\"count\").last(\"10m\") > 2" &&
      !strcontains(datadog_monitor.worker_queue_retries.query, "env:") &&
      !strcontains(datadog_monitor.worker_queue_retries.query, "@event:") &&
      !strcontains(datadog_monitor.worker_queue_retries.query, "@outcome:") &&
      datadog_monitor.worker_queue_retries.enable_logs_sample == false
    )
    error_message = "Queue alerting must search exact event and outcome text in the environment-specific unparsed Worker log body without embedding raw samples in notifications."
  }
}

run "availability_alerts_use_fast_and_slow_multi_window_burn_rates" {
  command = plan

  assert {
    condition = (
      datadog_monitor.availability_fast_burn.query == "burn_rate(\"availability-slo-id\").over(\"30d\").long_window(\"1h\").short_window(\"5m\") > 14.4" &&
      datadog_monitor.availability_slow_burn.query == "burn_rate(\"availability-slo-id\").over(\"30d\").long_window(\"6h\").short_window(\"30m\") > 6"
    )
    error_message = "Availability paging must use the declared fast and slow multi-window 30-day SLO burn rates."
  }
}

run "runtime_monitors_cover_event_loop_delay_utilization_and_heap_pressure" {
  command = plan

  assert {
    condition = (
      datadog_monitor.event_loop_delay_p99.query == "avg(last_5m):avg:nodejs.eventloop.delay.p99{service:cataqui-api,env:staging} by {service.instance.id} > 0.25" &&
      datadog_monitor.event_loop_utilization.query == "avg(last_5m):avg:nodejs.eventloop.utilization{service:cataqui-api,env:staging} by {service.instance.id} > 0.9" &&
      datadog_monitor.heap_pressure.query == "avg(last_5m):sum:v8js.memory.heap.used{service:cataqui-api,env:staging} by {service.instance.id} / sum:v8js.memory.heap.space.size{service:cataqui-api,env:staging} by {service.instance.id} * 100 > 90" &&
      datadog_monitor.event_loop_delay_p99.new_group_delay == 300 &&
      datadog_monitor.event_loop_delay_p99.notify_by == null &&
      datadog_monitor.event_loop_utilization.notify_by == null &&
      datadog_monitor.heap_pressure.notify_by == null &&
      datadog_monitor.failed_backend_operations.notify_by == null
    )
    error_message = "Grouped operation and runtime alerts must cover sustained failures without redundant notify_by values that the Datadog API rejects."
  }
}

run "synthetics_remains_disabled_by_default" {
  command = plan

  assert {
    condition = (
      length(datadog_synthetics_test.api_health) == 0 &&
      length(module.synthetic_test_restriction_policy) == 0 &&
      output.synthetic_test == null
    )
    error_message = "The billable Synthetic test must remain absent until enable_synthetics is explicitly true."
  }
}

run "production_synthetics_checks_the_public_dependency_health_endpoint" {
  command = plan

  variables {
    enable_synthetics          = true
    environment                = "production"
    pager_notification_handles = ["@pagerduty-backend"]
  }

  assert {
    condition = (
      datadog_synthetics_test.api_health[0].request_definition[0].url == "https://api.cataqui.com/v1/health" &&
      datadog_synthetics_test.api_health[0].locations == toset(["aws:sa-east-1"]) &&
      datadog_synthetics_test.api_health[0].options_list[0].tick_every == 300 &&
      datadog_synthetics_test.api_health[0].options_list[0].retry[0].count == 2 &&
      datadog_synthetics_test.api_health[0].options_list[0].retry[0].interval == 5000 &&
      datadog_synthetics_test.api_health[0].request_definition[0].no_saving_response_body == true &&
      datadog_synthetics_test.api_health[0].status == "live" &&
      length(datadog_synthetics_test.api_health[0].assertion) == 2 &&
      length(module.synthetic_test_restriction_policy) == 1 &&
      module.synthetic_test_restriction_policy[0].bindings.editors == toset(["role:00000000-0000-4000-8000-000000000000"]) &&
      module.synthetic_test_restriction_policy[0].bindings.viewers == toset(["org:00000000-0000-4000-8000-000000000001"])
    )
    error_message = "Enabled production Synthetics must check the public dependency-health endpoint from São Paulo without retaining the response body."
  }
}

run "runtime_pause_retains_managed_resources_without_notifications_or_synthetic_execution" {
  command = plan

  variables {
    enable_synthetics          = true
    runtime_telemetry_enabled  = false
    environment                = "production"
    pager_notification_handles = ["@pagerduty-backend"]
  }

  assert {
    condition = (
      alltrue([
        for monitor in [
          datadog_monitor.active_http_requests,
          datadog_monitor.application_lifecycle_failures,
          datadog_monitor.auth_exchange_active_requests_per_instance,
          datadog_monitor.auth_exchange_latency_p95,
          datadog_monitor.authentication_recovery_failures,
          datadog_monitor.availability_fast_burn,
          datadog_monitor.availability_slow_burn,
          datadog_monitor.cloudflare_worker_errors,
          datadog_monitor.container_runtime_failures,
          datadog_monitor.event_loop_delay_p99,
          datadog_monitor.event_loop_utilization,
          datadog_monitor.failed_backend_operations,
          datadog_monitor.geosearch_cloudflare_worker_errors,
          datadog_monitor.geosearch_provider_failures,
          datadog_monitor.geosearch_request_failures,
          datadog_monitor.heap_pressure,
          datadog_monitor.http_latency_p95,
          datadog_monitor.http_server_error_rate,
          datadog_monitor.http_telemetry_silence,
          datadog_monitor.rate_limit_enforcement_failures,
          datadog_monitor.typed_server_errors,
          datadog_monitor.webhooks_cloudflare_worker_errors,
          datadog_monitor.webhooks_inbound_delivery_failures,
          datadog_monitor.webhooks_request_failures,
          datadog_monitor.worker_edge_handoff_failures,
          datadog_monitor.worker_inbound_call_failures,
          datadog_monitor.worker_outbound_call_failures,
          datadog_monitor.worker_queue_retries,
        ] : monitor.draft_status == "draft"
      ]) &&
      length(datadog_synthetics_test.api_health) == 1 &&
      datadog_synthetics_test.api_health[0].status == "paused" &&
      length(module.monitor_restriction_policy) == 28 &&
      length(module.synthetic_test_restriction_policy) == 1
    )
    error_message = "Pausing runtime telemetry must retain OpenTofu ownership and restrictions while drafting every monitor and pausing the existing Synthetic to stop notifications and execution."
  }
}

run "production_pages_only_for_critical_incidents_and_their_recoveries" {
  command = plan

  variables {
    enable_synthetics          = true
    environment                = "production"
    pager_notification_handles = ["@pagerduty-backend"]
  }

  assert {
    condition = alltrue([
      for message in concat(
        [
          datadog_monitor.active_http_requests.message,
          datadog_monitor.application_lifecycle_failures.message,
          datadog_monitor.auth_exchange_active_requests_per_instance.message,
          datadog_monitor.auth_exchange_latency_p95.message,
          datadog_monitor.authentication_recovery_failures.message,
          datadog_monitor.availability_fast_burn.message,
          datadog_monitor.availability_slow_burn.message,
          datadog_monitor.cloudflare_worker_errors.message,
          datadog_monitor.container_runtime_failures.message,
          datadog_monitor.event_loop_delay_p99.message,
          datadog_monitor.event_loop_utilization.message,
          datadog_monitor.failed_backend_operations.message,
          datadog_monitor.geosearch_cloudflare_worker_errors.message,
          datadog_monitor.geosearch_provider_failures.message,
          datadog_monitor.geosearch_request_failures.message,
          datadog_monitor.heap_pressure.message,
          datadog_monitor.http_latency_p95.message,
          datadog_monitor.http_server_error_rate.message,
          datadog_monitor.http_telemetry_silence.message,
          datadog_monitor.rate_limit_enforcement_failures.message,
          datadog_monitor.typed_server_errors.message,
          datadog_monitor.webhooks_cloudflare_worker_errors.message,
          datadog_monitor.webhooks_inbound_delivery_failures.message,
          datadog_monitor.webhooks_request_failures.message,
          datadog_monitor.worker_edge_handoff_failures.message,
          datadog_monitor.worker_inbound_call_failures.message,
          datadog_monitor.worker_outbound_call_failures.message,
          datadog_monitor.worker_queue_retries.message,
        ],
        [datadog_synthetics_test.api_health[0].message],
        ) : (
        length(split("{{/is_alert}}", message)) == 2 &&
        strcontains(split("{{/is_alert}}", message)[0], "@pagerduty-backend") &&
        strcontains(split("{{/is_alert}}", message)[0], "@slack-backend-alerts") &&
        length(regexall("@pagerduty-backend", message)) == 2 &&
        strcontains(message, "{{#is_alert_recovery}}@pagerduty-backend{{/is_alert_recovery}}") &&
        strcontains(split("{{#is_recovery}}", message)[1], "@slack-backend-alerts") &&
        try(!strcontains(split("{{/is_warning}}", split("{{#is_warning}}", message)[1])[0], "@pagerduty-backend"), true) &&
        try(!strcontains(split("{{/is_no_data}}", split("{{#is_no_data}}", message)[1])[0], "@pagerduty-backend"), true)
      )
    ])
    error_message = "Every critical production alert and ALERT recovery must reach pager and non-paging destinations so incidents auto-resolve, while warning and no-data states and their recoveries must exclude the pager."
  }

  assert {
    condition = (
      datadog_monitor.http_telemetry_silence.query == "sum(last_15m):sum:cataqui.api.http.server.request.count{service:cataqui-api,env:production,traffic_surface:public_api}.as_count() < 1" &&
      datadog_monitor.http_telemetry_silence.notify_no_data == true &&
      datadog_monitor.http_telemetry_silence.no_data_timeframe == 30 &&
      datadog_monitor.http_telemetry_silence.priority == "1"
    )
    error_message = "Production traffic silence must use the reviewed minimum, enable no-data notification after thirty minutes, and remain paging priority."
  }
}

run "unsupported_environments_are_rejected" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

run "observability_cannot_be_planned_without_restricted_editor_roles" {
  command = plan

  variables {
    observability_editor_role_ids = []
  }

  expect_failures = [var.observability_editor_role_ids]
}

run "malformed_datadog_organization_ids_are_rejected" {
  command = plan

  variables {
    datadog_organization_id = "current-organization"
  }

  expect_failures = [var.datadog_organization_id]
}

run "malformed_observability_editor_role_ids_are_rejected" {
  command = plan

  variables {
    observability_editor_role_ids = ["administrator"]
  }

  expect_failures = [var.observability_editor_role_ids]
}

run "monitors_cannot_be_planned_without_nonpaging_destinations" {
  command = plan

  variables {
    nonpaging_notification_handles = []
  }

  expect_failures = [var.nonpaging_notification_handles]
}

run "malformed_nonpaging_notification_handles_are_rejected" {
  command = plan

  variables {
    nonpaging_notification_handles = ["backend alerts"]
  }

  expect_failures = [var.nonpaging_notification_handles]
}

run "production_cannot_be_planned_without_a_pager_destination" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [var.pager_notification_handles]
}

run "staging_rejects_pager_destinations" {
  command = plan

  variables {
    pager_notification_handles = ["@pagerduty-backend"]
  }

  expect_failures = [var.pager_notification_handles]
}

run "paging_and_nonpaging_destinations_must_be_disjoint" {
  command = plan

  variables {
    environment                = "production"
    pager_notification_handles = ["@slack-backend-alerts"]
  }

  expect_failures = [var.pager_notification_handles]
}

run "http_error_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    http_error_rate_critical_percent = 2
  }

  expect_failures = [var.http_error_rate_critical_percent]
}

run "availability_warning_must_be_stricter_than_the_target" {
  command = plan

  variables {
    availability_slo_warning_percent = 99.8
  }

  expect_failures = [var.availability_slo_warning_percent]
}

run "slow_burn_rate_must_be_lower_than_fast_burn_rate" {
  command = plan

  variables {
    slow_burn_rate_threshold = 14.4
  }

  expect_failures = [var.slow_burn_rate_threshold]
}

run "event_loop_utilization_alert_must_remain_reachable" {
  command = plan

  variables {
    event_loop_utilization_critical_ratio = 1
  }

  expect_failures = [var.event_loop_utilization_critical_ratio]
}

run "worker_edge_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    worker_edge_error_count_critical = 0
  }

  expect_failures = [var.worker_edge_error_count_critical]
}

run "runtime_failure_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    runtime_failure_count_critical = 0
  }

  expect_failures = [var.runtime_failure_count_critical]
}

run "rate_limit_enforcement_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    rate_limit_enforcement_failure_count_critical = 0
  }

  expect_failures = [var.rate_limit_enforcement_failure_count_critical]
}

run "authentication_recovery_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    authentication_recovery_failure_count_critical = 0
  }

  expect_failures = [var.authentication_recovery_failure_count_critical]
}

run "authentication_exchange_latency_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    auth_exchange_latency_p95_critical_seconds = 22
  }

  expect_failures = [var.auth_exchange_latency_p95_critical_seconds]
}

run "authentication_exchange_capacity_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    auth_exchange_active_requests_per_instance_critical = 20
  }

  expect_failures = [var.auth_exchange_active_requests_per_instance_critical]
}

run "worker_queue_retry_thresholds_must_increase_from_warning_to_critical" {
  command = plan

  variables {
    worker_queue_retry_batch_count_critical = 0
  }

  expect_failures = [var.worker_queue_retry_batch_count_critical]
}

run "enabled_synthetics_requires_at_least_one_location" {
  command = plan

  variables {
    enable_synthetics    = true
    synthetics_locations = []
  }

  expect_failures = [var.synthetics_locations]
}

run "unsupported_synthetics_intervals_are_rejected" {
  command = plan

  variables {
    synthetics_tick_every_seconds = 45
  }

  expect_failures = [var.synthetics_tick_every_seconds]
}

run "synthetics_latency_threshold_cannot_exceed_the_request_timeout" {
  command = plan

  variables {
    synthetics_response_time_critical_milliseconds = 10001
  }

  expect_failures = [var.synthetics_response_time_critical_milliseconds]
}
