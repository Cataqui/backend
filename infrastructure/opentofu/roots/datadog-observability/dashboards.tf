resource "datadog_dashboard" "service_health" {
  title            = "Cataquí API | ${title(var.environment)} | Service health"
  description      = "User-visible availability, latency, traffic, saturation, release, and alert status for the ${var.environment} Cataquí API. Managed by OpenTofu."
  layout_type      = "ordered"
  reflow_type      = "auto"
  restricted_roles = var.observability_editor_role_ids
  tags             = ["team:${var.team_name}"]

  widget {
    note_definition {
      content = <<-EOT
        ## Cataquí API service health
        **Owner:** @${var.team_name}
        **Environment:** `${var.environment}`
        **Runbook:** [API observability and incident response](${var.runbook_url})

        Container-handled availability is measured from application-owned request metrics, independent of trace sampling. The Cloudflare Worker error signal separately covers failures before Nest receives a request. Filter by immutable release and normalized route to correlate regressions without introducing high-cardinality identifiers.
      EOT

      background_color = "gray"
      font_size        = "14"
      has_padding      = true
      text_align       = "left"
      vertical_align   = "top"
    }
  }

  widget {
    service_level_objective_definition {
      title             = "Availability SLO and error budget"
      slo_id            = datadog_service_level_objective.api_availability.id
      show_error_budget = true
      time_windows      = ["7d", "30d", "90d"]
      view_mode         = "overall"
      view_type         = "detail"
    }
  }

  widget {
    manage_status_definition {
      title               = "Managed API monitors"
      color_preference    = "background"
      display_format      = "countsAndList"
      hide_zero_counts    = false
      query               = "tag:\"service:${var.service_name}\" tag:\"env:${var.environment}\" tag:\"managed_by:opentofu\""
      show_last_triggered = true
      show_priority       = true
      sort                = "priority,asc"
      summary_type        = "monitors"
    }
  }

  widget {
    query_value_definition {
      title       = "Completed requests (15m)"
      autoscale   = true
      precision   = 0
      text_align  = "center"
      live_span   = "15m"
      custom_unit = "requests"

      request {
        q          = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},version:$service_version,http_route:$http_route}.as_count()"
        aggregator = "sum"
      }
    }
  }

  widget {
    query_value_definition {
      title       = "Server error rate (5m)"
      autoscale   = false
      precision   = 2
      text_align  = "center"
      live_span   = "5m"
      custom_unit = "%"

      request {
        q          = "100 * (sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},version:$service_version,http_route:$http_route,availability_outcome:bad}.as_count() / sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},version:$service_version,http_route:$http_route,!availability_outcome:excluded}.as_count())"
        aggregator = "sum"

        conditional_formats {
          comparator = ">="
          value      = var.http_error_rate_critical_percent
          palette    = "white_on_red"
        }

        conditional_formats {
          comparator = ">="
          value      = var.http_error_rate_warning_percent
          palette    = "black_on_light_yellow"
        }

        conditional_formats {
          comparator = "<"
          value      = var.http_error_rate_warning_percent
          palette    = "white_on_green"
        }
      }
    }
  }

  widget {
    query_value_definition {
      title       = "HTTP p95 latency (5m)"
      autoscale   = true
      precision   = 3
      text_align  = "center"
      live_span   = "5m"
      custom_unit = "s"

      request {
        q          = "p95:${var.http_request_duration_metric_name}{${local.standard_public_latency_scope},version:$service_version,http_route:$http_route,!availability_outcome:excluded}"
        aggregator = "max"

        conditional_formats {
          comparator = ">="
          value      = var.http_latency_p95_critical_seconds
          palette    = "white_on_red"
        }

        conditional_formats {
          comparator = ">="
          value      = var.http_latency_p95_warning_seconds
          palette    = "black_on_light_yellow"
        }

        conditional_formats {
          comparator = "<"
          value      = var.http_latency_p95_warning_seconds
          palette    = "white_on_green"
        }
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Request rate by normalized route"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},version:$service_version,http_route:$http_route} by {http_route}.as_rate()"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "dog_classic"
        }
      }

      yaxis {
        include_zero = true
        label        = "requests/second"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "HTTP p95 latency by normalized route"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "p95:${var.http_request_duration_metric_name}{${local.standard_public_latency_scope},version:$service_version,http_route:$http_route,!availability_outcome:excluded} by {http_route}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "cool"
        }
      }

      marker {
        display_type = "warning dashed"
        label        = "warning"
        value        = "y = ${var.http_latency_p95_warning_seconds}"
      }

      marker {
        display_type = "error solid"
        label        = "critical"
        value        = "y = ${var.http_latency_p95_critical_seconds}"
      }

      yaxis {
        include_zero = true
        label        = "seconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Server errors by normalized route and status"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},version:$service_version,http_route:$http_route,availability_outcome:bad} by {http_route,status_code}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title       = "Active HTTP requests excluding auth exchange"
      live_span   = "4h"
      show_legend = true

      request {
        q            = "sum:${var.active_http_requests_metric_name}{${local.standard_active_requests_scope},version:$service_version}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "purple"
        }
      }

      marker {
        display_type = "warning dashed"
        label        = "warning"
        value        = "y = ${var.active_http_requests_warning}"
      }

      marker {
        display_type = "error solid"
        label        = "critical"
        value        = "y = ${var.active_http_requests_critical}"
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Unmatched request traffic"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.http_request_count_metric_name}{${local.metric_scope},traffic_surface:unmatched,version:$service_version} by {request_method,status_code}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "orange"
        }
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Cloudflare Worker uncaught errors"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.cloudflare_worker_error_count_metric_name}{script_name:${local.worker_script_name}}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      request {
        q            = "sum:${var.cloudflare_worker_error_count_metric_name}{script_name:${local.webhooks_worker_script_name}}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      yaxis {
        include_zero = true
        label        = "errors"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  template_variable {
    name     = "service_version"
    prefix   = "version"
    defaults = ["*"]
  }

  template_variable {
    name     = "http_route"
    prefix   = "http_route"
    defaults = ["*"]
  }
}

resource "datadog_dashboard" "ingress_and_authentication" {
  title            = "Cataquí API | ${title(var.environment)} | Ingress and authentication"
  description      = "Cloudflare API, Webhooks, and Geosearch Worker health, trusted inbound delivery, Google Places operations, and long-poll authentication exchange behavior for ${var.environment}. Managed by OpenTofu."
  layout_type      = "ordered"
  reflow_type      = "auto"
  restricted_roles = var.observability_editor_role_ids
  tags             = ["team:${var.team_name}"]

  widget {
    note_definition {
      content = <<-EOT
        ## Ingress and authentication
        **Owner:** @${var.team_name} · **Runbook:** [observability response](${var.runbook_url})

        Public API, provider Webhooks, Geosearch, Worker-to-Worker RPC, Queue delivery, and container processing are separate availability surfaces. Authentication exchange is an intentional long poll, so its latency and per-instance occupancy are isolated from standard API latency. Log widgets search privacy-bounded event names in the unparsed Cloudflare console body; request IDs remain correlation fields, never metric tags.
      EOT

      background_color = "gray"
      font_size        = "14"
      has_padding      = true
      text_align       = "left"
      vertical_align   = "top"
    }
  }

  widget {
    timeseries_definition {
      title          = "Cloudflare Worker request volume"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.cloudflare_worker_request_count_metric_name}{script_name:${local.worker_script_name}}.as_count()"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "blue"
        }
      }

      request {
        q            = "sum:${var.cloudflare_worker_request_count_metric_name}{script_name:${local.webhooks_worker_script_name}}.as_count()"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "green"
        }
      }

      request {
        q            = "sum:${var.cloudflare_worker_request_count_metric_name}{script_name:${local.geosearch_worker_script_name}}.as_count()"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "orange"
        }
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Cloudflare Worker p99 response time"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "avg:${var.cloudflare_worker_response_time_p99_metric_name}{script_name:${local.worker_script_name}}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "blue"
        }
      }

      request {
        q            = "avg:${var.cloudflare_worker_response_time_p99_metric_name}{script_name:${local.webhooks_worker_script_name}}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "green"
        }
      }

      request {
        q            = "avg:${var.cloudflare_worker_response_time_p99_metric_name}{script_name:${local.geosearch_worker_script_name}}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "orange"
        }
      }

      yaxis {
        include_zero = true
        label        = "microseconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Authentication exchange latency"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "p50:${var.http_request_duration_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},version:$service_version,!availability_outcome:excluded}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "cool"
        }
      }

      request {
        q            = "p95:${var.http_request_duration_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},version:$service_version,!availability_outcome:excluded}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "purple"
        }
      }

      request {
        q            = "p99:${var.http_request_duration_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},version:$service_version,!availability_outcome:excluded}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      marker {
        display_type = "warning dashed"
        label        = "long-poll lease window"
        value        = "y = ${var.auth_exchange_latency_p95_warning_seconds}"
      }

      marker {
        display_type = "error solid"
        label        = "lease expiration"
        value        = "y = ${var.auth_exchange_latency_p95_critical_seconds}"
      }

      yaxis {
        include_zero = true
        label        = "seconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Authentication exchange outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.http_request_count_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},version:$service_version} by {outcome,status_code}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "dog_classic"
        }
      }

      yaxis {
        include_zero = true
        label        = "exchanges"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Active authentication exchanges per container"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "max:${var.active_http_requests_metric_name}{${local.public_api_metric_scope},http_route:${local.auth_exchange_route},version:$service_version} by {service.instance.id}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "purple"
        }
      }

      marker {
        display_type = "warning dashed"
        label        = "warning"
        value        = "y = ${var.auth_exchange_active_requests_per_instance_warning}"
      }

      marker {
        display_type = "error solid"
        label        = "critical"
        value        = "y = ${var.auth_exchange_active_requests_per_instance_critical}"
      }

      yaxis {
        include_zero = true
        label        = "exchanges"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Container internal-inbound outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.http_request_count_metric_name}{${local.metric_scope},traffic_surface:internal_inbound,version:$service_version} by {http_route,outcome,status_code}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "dog_classic"
        }
      }

      yaxis {
        include_zero = true
        label        = "calls"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Webhooks request lifecycle"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.webhooks_worker_script_name} *:\"webhooks.request.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.webhooks_worker_script_name} *:\"webhooks.request.rejected\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.webhooks_worker_script_name} *:\"webhooks.request.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Webhooks-to-API inbound delivery"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.webhooks_worker_script_name} *:\"webhooks.api.inbound.delivery.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.webhooks_worker_script_name} *:\"webhooks.api.inbound.delivery.rejected\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "deliveries"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "API Worker outbound container calls"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.outbound.call.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.outbound.call.rejected\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.outbound.call.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "calls"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Authentication exchange wait and recovery outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.exchange.wait.completed\" AND *:\"ABORTED\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.exchange.wait.completed\" AND *:\"TIMED_OUT\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.exchange.wait.completed\" AND *:\"LEASE_DEADLINE_EXCEEDED\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.exchange.wait.completed\" AND *:\"LEASE_HELD_BY_ANOTHER_REQUEST\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} *:\"api.auth.notp.exchange.capacity_exhausted\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.redis_scripts.preload_failed\" OR *:\"api.auth.notp.exchange.lease_acquisition_failed\" OR *:\"api.auth.notp.exchange.lease_cleanup_failed\" OR *:\"api.auth.notp.exchange.subscription_create_failed\" OR *:\"api.auth.notp.exchange.subscription_failed\" OR *:\"api.auth.notp.exchange.subscription_cleanup_failed\" OR *:\"api.auth.notp.exchange.subscription_readiness_timed_out\" OR *:\"api.auth.notp.verification.recovery_failed\" OR *:\"api.auth.session.persistence_compensation.failed\")"
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "events"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Authentication message verification outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.verification.completed\" AND *:\"VERIFIED\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${var.service_name} env:${var.environment} (*:\"api.auth.notp.verification.completed\" AND *:\"NO_MATCH\")"
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "messages"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    log_stream_definition {
      title               = "Recent ingress and internal-delivery correlation logs"
      indexes             = ["*"]
      query               = "(service:${local.worker_script_name} OR service:${local.webhooks_worker_script_name} OR service:${local.geosearch_worker_script_name}) (*:\"api.worker.request.rejected\" OR *:\"api.worker.request.failed\" OR *:\"api.container.runtime.failed\" OR *:\"api.container.stopped.unexpected\" OR *:\"api.worker.inbound.call.rejected\" OR *:\"api.worker.inbound.call.failed\" OR *:\"api.worker.outbound.call.rejected\" OR *:\"api.worker.outbound.call.failed\" OR *:\"api.worker.queue.delivery.rejected\" OR *:\"api.worker.queue.delivery.failed\" OR (*:\"api.worker.queue.batch.completed\" AND *:\"RETRY_SCHEDULED\") OR *:\"api.worker.queue.batch.failed\" OR *:\"webhooks.request.rejected\" OR *:\"webhooks.request.failed\" OR *:\"webhooks.api.inbound.delivery.rejected\" OR *:\"geosearch.request.rejected\" OR *:\"geosearch.request.failed\" OR *:\"geosearch.provider.request.rejected\" OR *:\"geosearch.provider.request.failed\")"
      columns             = ["core_service", "message"]
      show_date_column    = true
      show_message_column = true
      message_display     = "expanded-md"

      sort {
        column = "time"
        order  = "desc"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Geosearch request lifecycle"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.geosearch_worker_script_name} *:\"geosearch.request.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.geosearch_worker_script_name} *:\"geosearch.request.rejected\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.geosearch_worker_script_name} *:\"geosearch.request.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Google Places operation duration by operation and outcome"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "avg"
            facet       = "@durationMilliseconds"
            interval    = 60000
          }
          search_query = "service:${local.geosearch_worker_script_name} (*:\"geosearch.provider.request.completed\" OR *:\"geosearch.provider.request.rejected\" OR *:\"geosearch.provider.request.failed\")"

          group_by {
            facet = "@operation"
            limit = 10

            sort_query {
              aggregation = "avg"
              facet       = "@durationMilliseconds"
              order       = "desc"
            }
          }

          group_by {
            facet = "@outcome"
            limit = 10

            sort_query {
              aggregation = "avg"
              facet       = "@durationMilliseconds"
              order       = "desc"
            }
          }
        }
        display_type = "line"
      }

      yaxis {
        include_zero = true
        label        = "milliseconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "API Worker inbound RPC lifecycle"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.inbound.call.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.inbound.call.rejected\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.inbound.call.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "calls"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Queue-to-container delivery lifecycle"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.queue.delivery.completed\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.queue.delivery.rejected\""
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.queue.delivery.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "deliveries"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Queue batch terminal outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} (*:\"api.worker.queue.batch.completed\" AND *:\"SUCCESS\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} (*:\"api.worker.queue.batch.completed\" AND *:\"RETRY_SCHEDULED\")"
        }
        display_type = "bars"
      }

      request {
        log_query {
          index = "*"
          compute_query {
            aggregation = "count"
            interval    = 60000
          }
          search_query = "service:${local.worker_script_name} *:\"api.worker.queue.batch.failed\""
        }
        display_type = "bars"
      }

      yaxis {
        include_zero = true
        label        = "batches"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  template_variable {
    name     = "service_version"
    prefix   = "version"
    defaults = ["*"]
  }
}

resource "datadog_dashboard" "product_and_runtime" {
  title            = "Cataquí API | ${title(var.environment)} | Product and runtime deep dive"
  description      = "Successful product API request outcomes, backend operation outcomes, typed failures, and Node.js runtime pressure for the ${var.environment} Cataquí API. Managed by OpenTofu."
  layout_type      = "ordered"
  reflow_type      = "auto"
  restricted_roles = var.observability_editor_role_ids
  tags             = ["team:${var.team_name}"]

  widget {
    note_definition {
      content = <<-EOT
        ## Product and runtime deep dive
        Product analytics contains only registered, successful product API request outcomes; these counters do not imply later off-platform work or business completion. Error, route, operation, and runtime dimensions are bounded enums or normalized templates. Never add user, request, post, session, phone, IP, query-string, or arbitrary error-message tags.

        **Owner:** @${var.team_name} · **Runbook:** [observability response](${var.runbook_url})
      EOT

      background_color = "gray"
      font_size        = "14"
      has_padding      = true
      text_align       = "left"
      vertical_align   = "top"
    }
  }

  widget {
    query_value_definition {
      title       = "Successful product API requests (24h)"
      autoscale   = true
      precision   = 0
      text_align  = "center"
      live_span   = "1d"
      custom_unit = "requests"

      request {
        q          = "sum:${var.product_event_count_metric_name}{${local.metric_scope},version:$service_version}.as_count()"
        aggregator = "sum"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Successful product API requests"
      live_span      = "1d"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.product_event_count_metric_name}{${local.metric_scope},version:$service_version} by {product_event}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "dog_classic"
        }
      }

      yaxis {
        include_zero = true
        label        = "requests"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    toplist_definition {
      title     = "Top successful product API requests"
      live_span = "1d"

      request {
        q = "sum:${var.product_event_count_metric_name}{${local.metric_scope},version:$service_version} by {product_event}.as_count()"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Backend operation outcomes"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.operation_count_metric_name}{${local.metric_scope},version:$service_version} by {operation_name,outcome}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "dog_classic"
        }
      }

      yaxis {
        include_zero = true
        label        = "operations"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Backend operation p95 latency"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "p95:${var.operation_duration_metric_name}{${local.metric_scope},version:$service_version} by {operation_name,outcome}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "cool"
        }
      }

      yaxis {
        include_zero = true
        label        = "seconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Typed API errors by origin and stable code"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["sum", "max", "value"]

      request {
        q            = "sum:${var.api_error_count_metric_name}{${local.metric_scope},version:$service_version} by {error_origin,error_code}.as_count()"
        display_type = "bars"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      yaxis {
        include_zero = true
        label        = "errors"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "Node.js event-loop pressure"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "avg:${var.event_loop_delay_p99_metric_name}{${local.metric_scope},version:$service_version}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "orange"
        }
      }

      request {
        q              = "avg:${var.event_loop_utilization_metric_name}{${local.metric_scope},version:$service_version}"
        display_type   = "line"
        on_right_yaxis = true

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "purple"
        }
      }

      yaxis {
        include_zero = true
        label        = "p99 delay (seconds)"
        min          = "0"
        scale        = "linear"
      }

      right_yaxis {
        include_zero = true
        label        = "utilization ratio"
        min          = "0"
        max          = "1"
        scale        = "linear"
      }
    }
  }

  widget {
    timeseries_definition {
      title          = "V8 heap used and allocated"
      live_span      = "4h"
      show_legend    = true
      legend_layout  = "vertical"
      legend_columns = ["avg", "max", "value"]

      request {
        q            = "sum:${var.heap_used_metric_name}{${local.metric_scope},version:$service_version}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      request {
        q            = "sum:${var.heap_size_metric_name}{${local.metric_scope},version:$service_version}"
        display_type = "line"

        style {
          line_type  = "dashed"
          line_width = "normal"
          palette    = "cool"
        }
      }

      yaxis {
        include_zero = true
        label        = "bytes"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    query_value_definition {
      title       = "V8 heap pressure (5m)"
      autoscale   = false
      precision   = 1
      text_align  = "center"
      live_span   = "5m"
      custom_unit = "%"

      request {
        q          = "100 * (sum:${var.heap_used_metric_name}{${local.metric_scope},version:$service_version} / sum:${var.heap_size_metric_name}{${local.metric_scope},version:$service_version})"
        aggregator = "max"

        conditional_formats {
          comparator = ">="
          value      = var.heap_pressure_critical_percent
          palette    = "white_on_red"
        }

        conditional_formats {
          comparator = ">="
          value      = var.heap_pressure_warning_percent
          palette    = "black_on_light_yellow"
        }

        conditional_formats {
          comparator = "<"
          value      = var.heap_pressure_warning_percent
          palette    = "white_on_green"
        }
      }
    }
  }

  widget {
    timeseries_definition {
      title       = "Garbage-collection pause p95"
      live_span   = "4h"
      show_legend = true

      request {
        q            = "p95:${var.garbage_collection_duration_metric_name}{${local.metric_scope},version:$service_version}"
        display_type = "line"

        style {
          line_type  = "solid"
          line_width = "normal"
          palette    = "warm"
        }
      }

      yaxis {
        include_zero = true
        label        = "seconds"
        min          = "0"
        scale        = "linear"
      }
    }
  }

  widget {
    log_stream_definition {
      title               = "Recent container failure logs"
      indexes             = ["*"]
      query               = "service:${var.service_name} env:${var.environment} version:$service_version (status:error OR *:\"api.application.start.failed\" OR *:\"api.telemetry.shutdown.failed\")"
      columns             = ["message"]
      show_date_column    = true
      show_message_column = true
      message_display     = "expanded-md"

      sort {
        column = "time"
        order  = "desc"
      }
    }
  }

  template_variable {
    name     = "service_version"
    prefix   = "version"
    defaults = ["*"]
  }
}
