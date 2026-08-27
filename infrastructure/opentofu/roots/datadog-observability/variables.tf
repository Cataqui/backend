variable "environment" {
  description = "Persistent Cataquí API environment whose Datadog observability resources OpenTofu manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production. Development observability remains locally managed."
  }
}

variable "runtime_telemetry_enabled" {
  description = "Whether runtime export and notifications are enabled. False retains OpenTofu ownership while pausing every managed monitor and Synthetic."
  type        = bool
  default     = false
}

variable "service_name" {
  description = "Stable Datadog unified-service-tagging name emitted by the API runtime."
  type        = string
  default     = "cataqui-api"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,62}[a-z0-9]$", var.service_name))
    error_message = "service_name must contain 3 to 64 lowercase letters, digits, or hyphens, start with a letter, and end with a letter or digit."
  }
}

variable "team_name" {
  description = "Datadog team handle that owns the API service and its observability resources."
  type        = string
  default     = "backend"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,62}[a-z0-9]$", var.team_name))
    error_message = "team_name must contain 3 to 64 lowercase letters, digits, or hyphens, start with a letter, and end with a letter or digit."
  }
}

variable "datadog_organization_id" {
  description = "Datadog organization UUID that retains viewer access to every managed restriction policy. This account-specific value is intentionally required."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", var.datadog_organization_id))
    error_message = "datadog_organization_id must be the lowercase RFC 4122 UUID returned for the selected Datadog organization."
  }
}

variable "observability_editor_role_ids" {
  description = "Datadog role UUIDs whose members may edit the managed dashboards, monitors, SLO, and optional Synthetic. This account-specific value is intentionally required."
  type        = set(string)

  validation {
    condition     = length(var.observability_editor_role_ids) > 0
    error_message = "observability_editor_role_ids must contain at least one Datadog role UUID so managed observability resources are never created with unrestricted editing."
  }

  validation {
    condition = alltrue([
      for role_id in var.observability_editor_role_ids :
      can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", role_id))
    ])
    error_message = "Every observability_editor_role_ids value must be a lowercase RFC 4122 UUID returned by the Datadog Roles API."
  }
}

variable "nonpaging_notification_handles" {
  description = "Non-paging Datadog notification handles appended to alert, warning, no-data, and recovery messages."
  type        = set(string)

  validation {
    condition     = length(var.nonpaging_notification_handles) > 0
    error_message = "nonpaging_notification_handles must contain at least one destination so warnings and recoveries cannot be silent."
  }

  validation {
    condition = alltrue([
      for notification_handle in var.nonpaging_notification_handles :
      can(regex("^@[A-Za-z0-9][A-Za-z0-9._+@:/-]{0,254}$", notification_handle))
    ])
    error_message = "Every nonpaging_notification_handles value must be a whitespace-free Datadog notification handle beginning with @. Example: @slack-backend-alerts."
  }
}

variable "pager_notification_handles" {
  description = "Paging Datadog notification handles used only for critical production alerts and their recoveries so paging incidents auto-resolve. Staging must keep this set empty."
  type        = set(string)

  validation {
    condition = (
      (var.environment == "production" && length(var.pager_notification_handles) > 0) ||
      (var.environment == "staging" && length(var.pager_notification_handles) == 0)
    )
    error_message = "pager_notification_handles must contain at least one paging destination in production and must be empty in staging."
  }

  validation {
    condition = alltrue([
      for notification_handle in var.pager_notification_handles :
      can(regex("^@[A-Za-z0-9][A-Za-z0-9._+@:/-]{0,254}$", notification_handle))
    ])
    error_message = "Every pager_notification_handles value must be a whitespace-free Datadog notification handle beginning with @. Example: @pagerduty-backend."
  }

  validation {
    condition     = length(setintersection(var.pager_notification_handles, var.nonpaging_notification_handles)) == 0
    error_message = "pager_notification_handles and nonpaging_notification_handles must not contain the same destination."
  }
}

variable "runbook_url" {
  description = "HTTPS URL attached to every monitor and dashboard for incident response guidance."
  type        = string
  default     = "https://github.com/Cataqui/backend/blob/main/docs/observability.md"

  validation {
    condition     = can(regex("^https://[^[:space:]]+$", var.runbook_url))
    error_message = "runbook_url must be an absolute HTTPS URL without whitespace."
  }
}

variable "http_request_count_metric_name" {
  description = "OpenTelemetry counter name for completed API HTTP requests."
  type        = string
  default     = "cataqui.api.http.server.request.count"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.http_request_count_metric_name))
    error_message = "http_request_count_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "http_request_duration_metric_name" {
  description = "OpenTelemetry histogram name for API HTTP request duration in seconds."
  type        = string
  default     = "cataqui.api.http.server.request.duration"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.http_request_duration_metric_name))
    error_message = "http_request_duration_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "active_http_requests_metric_name" {
  description = "OpenTelemetry observable gauge name for in-flight API HTTP requests."
  type        = string
  default     = "cataqui.api.http.server.active_requests"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.active_http_requests_metric_name))
    error_message = "active_http_requests_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "api_error_count_metric_name" {
  description = "OpenTelemetry counter name for typed API errors."
  type        = string
  default     = "cataqui.api.error.count"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.api_error_count_metric_name))
    error_message = "api_error_count_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "product_event_count_metric_name" {
  description = "OpenTelemetry counter name for bounded successful product API requests."
  type        = string
  default     = "cataqui.api.product.event.count"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.product_event_count_metric_name))
    error_message = "product_event_count_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "operation_count_metric_name" {
  description = "OpenTelemetry counter name for important backend operation outcomes."
  type        = string
  default     = "cataqui.api.operation.count"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.operation_count_metric_name))
    error_message = "operation_count_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "operation_duration_metric_name" {
  description = "OpenTelemetry histogram name for important backend operation duration in seconds."
  type        = string
  default     = "cataqui.api.operation.duration"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.operation_duration_metric_name))
    error_message = "operation_duration_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "event_loop_delay_p99_metric_name" {
  description = "OpenTelemetry Node.js runtime gauge name for p99 event-loop delay in seconds."
  type        = string
  default     = "nodejs.eventloop.delay.p99"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.event_loop_delay_p99_metric_name))
    error_message = "event_loop_delay_p99_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "event_loop_utilization_metric_name" {
  description = "OpenTelemetry Node.js runtime gauge name for event-loop utilization from zero to one."
  type        = string
  default     = "nodejs.eventloop.utilization"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.event_loop_utilization_metric_name))
    error_message = "event_loop_utilization_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "heap_used_metric_name" {
  description = "OpenTelemetry V8 runtime gauge name for heap bytes used by heap space."
  type        = string
  default     = "v8js.memory.heap.used"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.heap_used_metric_name))
    error_message = "heap_used_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "heap_size_metric_name" {
  description = "OpenTelemetry V8 runtime gauge name for pre-allocated heap-space bytes."
  type        = string
  default     = "v8js.memory.heap.space.size"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.heap_size_metric_name))
    error_message = "heap_size_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "garbage_collection_duration_metric_name" {
  description = "OpenTelemetry V8 runtime histogram name for garbage-collection pause duration in seconds."
  type        = string
  default     = "v8js.gc.duration"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.garbage_collection_duration_metric_name))
    error_message = "garbage_collection_duration_metric_name must be a lowercase OpenTelemetry metric name containing only letters, digits, dots, or underscores."
  }
}

variable "cloudflare_worker_error_count_metric_name" {
  description = "Datadog Cloudflare integration count metric for uncaught Worker request errors."
  type        = string
  default     = "cloudflare.workers.requests.errors"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.cloudflare_worker_error_count_metric_name))
    error_message = "cloudflare_worker_error_count_metric_name must be a lowercase metric name containing only letters, digits, dots, or underscores."
  }
}

variable "cloudflare_worker_request_count_metric_name" {
  description = "Datadog Cloudflare integration count metric for Worker requests."
  type        = string
  default     = "cloudflare.workers.requests.all"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.cloudflare_worker_request_count_metric_name))
    error_message = "cloudflare_worker_request_count_metric_name must be a lowercase metric name containing only letters, digits, dots, or underscores."
  }
}

variable "cloudflare_worker_response_time_p99_metric_name" {
  description = "Datadog Cloudflare integration gauge for Worker p99 response time."
  type        = string
  default     = "cloudflare.workers.response_time.99p"

  validation {
    condition     = can(regex("^[a-z][a-z0-9._]{2,254}$", var.cloudflare_worker_response_time_p99_metric_name))
    error_message = "cloudflare_worker_response_time_p99_metric_name must be a lowercase metric name containing only letters, digits, dots, or underscores."
  }
}

variable "http_error_rate_warning_percent" {
  description = "Five-minute server-error percentage that places the HTTP error-rate monitor in warning."
  type        = number
  default     = 2

  validation {
    condition     = var.http_error_rate_warning_percent > 0 && var.http_error_rate_warning_percent < 100
    error_message = "http_error_rate_warning_percent must be greater than 0 and less than 100."
  }
}

variable "http_error_rate_critical_percent" {
  description = "Five-minute server-error percentage that places the HTTP error-rate monitor in alert."
  type        = number
  default     = 5

  validation {
    condition = (
      var.http_error_rate_critical_percent > var.http_error_rate_warning_percent &&
      var.http_error_rate_critical_percent < 100
    )
    error_message = "http_error_rate_critical_percent must be greater than http_error_rate_warning_percent and less than 100."
  }
}

variable "http_latency_p95_warning_seconds" {
  description = "Five-minute p95 HTTP latency in seconds that places the latency monitor in warning."
  type        = number
  default     = 0.75

  validation {
    condition     = var.http_latency_p95_warning_seconds > 0
    error_message = "http_latency_p95_warning_seconds must be greater than 0."
  }
}

variable "http_latency_p95_critical_seconds" {
  description = "Five-minute p95 HTTP latency in seconds that places the latency monitor in alert."
  type        = number
  default     = 1.5

  validation {
    condition     = var.http_latency_p95_critical_seconds > var.http_latency_p95_warning_seconds
    error_message = "http_latency_p95_critical_seconds must be greater than http_latency_p95_warning_seconds."
  }
}

variable "auth_exchange_latency_p95_warning_seconds" {
  description = "Five-minute p95 authentication-exchange latency that warns after the expected long-poll lease window."
  type        = number
  default     = 22

  validation {
    condition     = var.auth_exchange_latency_p95_warning_seconds > 0
    error_message = "auth_exchange_latency_p95_warning_seconds must be greater than 0."
  }
}

variable "auth_exchange_latency_p95_critical_seconds" {
  description = "Five-minute p95 authentication-exchange latency that alerts at the long-poll lease-expiration boundary."
  type        = number
  default     = 25

  validation {
    condition     = var.auth_exchange_latency_p95_critical_seconds > var.auth_exchange_latency_p95_warning_seconds
    error_message = "auth_exchange_latency_p95_critical_seconds must be greater than auth_exchange_latency_p95_warning_seconds."
  }
}

variable "active_http_requests_warning" {
  description = "Five-minute average concurrent HTTP requests that places the saturation monitor in warning."
  type        = number
  default     = 250

  validation {
    condition     = var.active_http_requests_warning > 0 && floor(var.active_http_requests_warning) == var.active_http_requests_warning
    error_message = "active_http_requests_warning must be a positive whole number."
  }
}

variable "active_http_requests_critical" {
  description = "Five-minute average concurrent HTTP requests that places the saturation monitor in alert."
  type        = number
  default     = 500

  validation {
    condition = (
      var.active_http_requests_critical > var.active_http_requests_warning &&
      floor(var.active_http_requests_critical) == var.active_http_requests_critical
    )
    error_message = "active_http_requests_critical must be a whole number greater than active_http_requests_warning."
  }
}

variable "auth_exchange_active_requests_per_instance_warning" {
  description = "Concurrent authentication exchanges on one container that warn before the application-owned long-poll limit."
  type        = number
  default     = 20

  validation {
    condition = (
      var.auth_exchange_active_requests_per_instance_warning > 0 &&
      floor(var.auth_exchange_active_requests_per_instance_warning) == var.auth_exchange_active_requests_per_instance_warning
    )
    error_message = "auth_exchange_active_requests_per_instance_warning must be a positive whole number."
  }
}

variable "auth_exchange_active_requests_per_instance_critical" {
  description = "Concurrent authentication exchanges on one container that alert immediately below the application-owned long-poll limit."
  type        = number
  default     = 24

  validation {
    condition = (
      var.auth_exchange_active_requests_per_instance_critical > var.auth_exchange_active_requests_per_instance_warning &&
      floor(var.auth_exchange_active_requests_per_instance_critical) == var.auth_exchange_active_requests_per_instance_critical
    )
    error_message = "auth_exchange_active_requests_per_instance_critical must be a whole number greater than auth_exchange_active_requests_per_instance_warning."
  }
}

variable "server_error_count_warning" {
  description = "Typed server errors in five minutes that place the server-error monitor in warning."
  type        = number
  default     = 5

  validation {
    condition     = var.server_error_count_warning > 0 && floor(var.server_error_count_warning) == var.server_error_count_warning
    error_message = "server_error_count_warning must be a positive whole number."
  }
}

variable "server_error_count_critical" {
  description = "Typed server errors in five minutes that place the server-error monitor in alert."
  type        = number
  default     = 15

  validation {
    condition = (
      var.server_error_count_critical > var.server_error_count_warning &&
      floor(var.server_error_count_critical) == var.server_error_count_critical
    )
    error_message = "server_error_count_critical must be a whole number greater than server_error_count_warning."
  }
}

variable "runtime_failure_count_warning" {
  description = "Fatal application or container runtime lifecycle failures in five minutes that place runtime availability in warning."
  type        = number
  default     = 0

  validation {
    condition     = var.runtime_failure_count_warning >= 0 && floor(var.runtime_failure_count_warning) == var.runtime_failure_count_warning
    error_message = "runtime_failure_count_warning must be a non-negative whole number."
  }
}

variable "runtime_failure_count_critical" {
  description = "Fatal application or container runtime lifecycle failures in five minutes that place runtime availability in alert."
  type        = number
  default     = 2

  validation {
    condition = (
      var.runtime_failure_count_critical > var.runtime_failure_count_warning &&
      floor(var.runtime_failure_count_critical) == var.runtime_failure_count_critical
    )
    error_message = "runtime_failure_count_critical must be a whole number greater than runtime_failure_count_warning."
  }
}

variable "rate_limit_enforcement_failure_count_warning" {
  description = "Rate-limit backend enforcement failures in five minutes that place the fail-closed recovery monitor in warning."
  type        = number
  default     = 0

  validation {
    condition = (
      var.rate_limit_enforcement_failure_count_warning >= 0 &&
      floor(var.rate_limit_enforcement_failure_count_warning) == var.rate_limit_enforcement_failure_count_warning
    )
    error_message = "rate_limit_enforcement_failure_count_warning must be a non-negative whole number."
  }
}

variable "rate_limit_enforcement_failure_count_critical" {
  description = "Rate-limit backend enforcement failures in five minutes that alert on user-visible fail-closed rejections."
  type        = number
  default     = 2

  validation {
    condition = (
      var.rate_limit_enforcement_failure_count_critical > var.rate_limit_enforcement_failure_count_warning &&
      floor(var.rate_limit_enforcement_failure_count_critical) == var.rate_limit_enforcement_failure_count_critical
    )
    error_message = "rate_limit_enforcement_failure_count_critical must be a whole number greater than rate_limit_enforcement_failure_count_warning."
  }
}

variable "authentication_recovery_failure_count_warning" {
  description = "Authentication recovery failures in five minutes that place the state-consistency monitor in warning."
  type        = number
  default     = 0

  validation {
    condition = (
      var.authentication_recovery_failure_count_warning >= 0 &&
      floor(var.authentication_recovery_failure_count_warning) == var.authentication_recovery_failure_count_warning
    )
    error_message = "authentication_recovery_failure_count_warning must be a non-negative whole number."
  }
}

variable "authentication_recovery_failure_count_critical" {
  description = "Authentication recovery failures in five minutes that alert on uncertain or unavailable authentication state."
  type        = number
  default     = 2

  validation {
    condition = (
      var.authentication_recovery_failure_count_critical > var.authentication_recovery_failure_count_warning &&
      floor(var.authentication_recovery_failure_count_critical) == var.authentication_recovery_failure_count_critical
    )
    error_message = "authentication_recovery_failure_count_critical must be a whole number greater than authentication_recovery_failure_count_warning."
  }
}

variable "operation_error_count_warning" {
  description = "Failed important backend operations per operation in ten minutes that place the monitor in warning."
  type        = number
  default     = 3

  validation {
    condition     = var.operation_error_count_warning > 0 && floor(var.operation_error_count_warning) == var.operation_error_count_warning
    error_message = "operation_error_count_warning must be a positive whole number."
  }
}

variable "operation_error_count_critical" {
  description = "Failed important backend operations per operation in ten minutes that place the monitor in alert."
  type        = number
  default     = 10

  validation {
    condition = (
      var.operation_error_count_critical > var.operation_error_count_warning &&
      floor(var.operation_error_count_critical) == var.operation_error_count_critical
    )
    error_message = "operation_error_count_critical must be a whole number greater than operation_error_count_warning."
  }
}

variable "minimum_production_http_requests_per_15_minutes" {
  description = "Minimum completed production requests expected in fifteen minutes before the traffic-backed telemetry-silence monitor alerts. Staging alerting is disabled because idle periods are expected."
  type        = number
  default     = 1

  validation {
    condition = (
      var.minimum_production_http_requests_per_15_minutes > 0 &&
      floor(var.minimum_production_http_requests_per_15_minutes) == var.minimum_production_http_requests_per_15_minutes
    )
    error_message = "minimum_production_http_requests_per_15_minutes must be a positive whole number."
  }
}

variable "worker_edge_error_count_warning" {
  description = "Worker handoff or uncaught edge errors in the evaluation window that place edge availability in warning."
  type        = number
  default     = 0

  validation {
    condition     = var.worker_edge_error_count_warning >= 0 && floor(var.worker_edge_error_count_warning) == var.worker_edge_error_count_warning
    error_message = "worker_edge_error_count_warning must be a non-negative whole number."
  }
}

variable "worker_edge_error_count_critical" {
  description = "Worker handoff or uncaught edge errors in the evaluation window that place edge availability in alert."
  type        = number
  default     = 2

  validation {
    condition = (
      var.worker_edge_error_count_critical > var.worker_edge_error_count_warning &&
      floor(var.worker_edge_error_count_critical) == var.worker_edge_error_count_critical
    )
    error_message = "worker_edge_error_count_critical must be a whole number greater than worker_edge_error_count_warning."
  }
}

variable "worker_queue_retry_batch_count_warning" {
  description = "Queue batches that schedule retries or fail in ten minutes before the Queue monitor warns."
  type        = number
  default     = 0

  validation {
    condition = (
      var.worker_queue_retry_batch_count_warning >= 0 &&
      floor(var.worker_queue_retry_batch_count_warning) == var.worker_queue_retry_batch_count_warning
    )
    error_message = "worker_queue_retry_batch_count_warning must be a non-negative whole number."
  }
}

variable "worker_queue_retry_batch_count_critical" {
  description = "Queue batches that schedule retries or fail in ten minutes before the Queue monitor alerts."
  type        = number
  default     = 2

  validation {
    condition = (
      var.worker_queue_retry_batch_count_critical > var.worker_queue_retry_batch_count_warning &&
      floor(var.worker_queue_retry_batch_count_critical) == var.worker_queue_retry_batch_count_critical
    )
    error_message = "worker_queue_retry_batch_count_critical must be a whole number greater than worker_queue_retry_batch_count_warning."
  }
}

variable "event_loop_delay_p99_warning_seconds" {
  description = "Five-minute average p99 Node.js event-loop delay in seconds that places the monitor in warning."
  type        = number
  default     = 0.1

  validation {
    condition     = var.event_loop_delay_p99_warning_seconds > 0
    error_message = "event_loop_delay_p99_warning_seconds must be greater than 0."
  }
}

variable "event_loop_delay_p99_critical_seconds" {
  description = "Five-minute average p99 Node.js event-loop delay in seconds that places the monitor in alert."
  type        = number
  default     = 0.25

  validation {
    condition     = var.event_loop_delay_p99_critical_seconds > var.event_loop_delay_p99_warning_seconds
    error_message = "event_loop_delay_p99_critical_seconds must be greater than event_loop_delay_p99_warning_seconds."
  }
}

variable "event_loop_utilization_warning_ratio" {
  description = "Five-minute Node.js event-loop utilization ratio that places the monitor in warning."
  type        = number
  default     = 0.75

  validation {
    condition     = var.event_loop_utilization_warning_ratio > 0 && var.event_loop_utilization_warning_ratio < 1
    error_message = "event_loop_utilization_warning_ratio must be greater than 0 and less than 1."
  }
}

variable "event_loop_utilization_critical_ratio" {
  description = "Five-minute Node.js event-loop utilization ratio that places the monitor in alert."
  type        = number
  default     = 0.9

  validation {
    condition = (
      var.event_loop_utilization_critical_ratio > var.event_loop_utilization_warning_ratio &&
      var.event_loop_utilization_critical_ratio < 1
    )
    error_message = "event_loop_utilization_critical_ratio must be greater than event_loop_utilization_warning_ratio and less than 1."
  }
}

variable "heap_pressure_warning_percent" {
  description = "Five-minute V8 heap-used percentage that places the heap-pressure monitor in warning."
  type        = number
  default     = 80

  validation {
    condition     = var.heap_pressure_warning_percent > 0 && var.heap_pressure_warning_percent < 100
    error_message = "heap_pressure_warning_percent must be greater than 0 and less than 100."
  }
}

variable "heap_pressure_critical_percent" {
  description = "Five-minute V8 heap-used percentage that places the heap-pressure monitor in alert."
  type        = number
  default     = 90

  validation {
    condition = (
      var.heap_pressure_critical_percent > var.heap_pressure_warning_percent &&
      var.heap_pressure_critical_percent < 100
    )
    error_message = "heap_pressure_critical_percent must be greater than heap_pressure_warning_percent and less than 100."
  }
}

variable "availability_slo_target_percent" {
  description = "Good-request target shared by the 7-day, 30-day, and 90-day availability SLO windows."
  type        = number
  default     = 99.9

  validation {
    condition     = var.availability_slo_target_percent > 0 && var.availability_slo_target_percent < 100
    error_message = "availability_slo_target_percent must be greater than 0 and less than 100."
  }
}

variable "availability_slo_warning_percent" {
  description = "SLO warning target, which must be stricter than the availability target."
  type        = number
  default     = 99.95

  validation {
    condition = (
      var.availability_slo_warning_percent > var.availability_slo_target_percent &&
      var.availability_slo_warning_percent < 100
    )
    error_message = "availability_slo_warning_percent must be greater than availability_slo_target_percent and less than 100."
  }
}

variable "fast_burn_rate_threshold" {
  description = "Thirty-day SLO burn rate that pages after both the one-hour and five-minute windows breach."
  type        = number
  default     = 14.4

  validation {
    condition = (
      var.fast_burn_rate_threshold > 0 &&
      var.fast_burn_rate_threshold <= 100 / (100 - var.availability_slo_target_percent)
    )
    error_message = "fast_burn_rate_threshold must be positive and no greater than the maximum possible burn rate for availability_slo_target_percent."
  }
}

variable "slow_burn_rate_threshold" {
  description = "Thirty-day SLO burn rate that alerts after both the six-hour and thirty-minute windows breach."
  type        = number
  default     = 6

  validation {
    condition = (
      var.slow_burn_rate_threshold > 0 &&
      var.slow_burn_rate_threshold < var.fast_burn_rate_threshold &&
      var.slow_burn_rate_threshold <= 100 / (100 - var.availability_slo_target_percent)
    )
    error_message = "slow_burn_rate_threshold must be positive, less than fast_burn_rate_threshold, and no greater than the maximum possible burn rate for availability_slo_target_percent."
  }
}

variable "enable_synthetics" {
  description = "Whether to create a billable public Datadog API Synthetic test against the environment health endpoint."
  type        = bool
  default     = false
}

variable "synthetics_locations" {
  description = "Datadog public or private location identifiers used when the Synthetic API test is enabled."
  type        = set(string)
  default     = ["aws:sa-east-1"]

  validation {
    condition = (
      !var.enable_synthetics ||
      (
        length(var.synthetics_locations) > 0 &&
        alltrue([
          for location in var.synthetics_locations :
          can(regex("^[A-Za-z0-9][A-Za-z0-9:_-]{1,254}$", location))
        ])
      )
    )
    error_message = "synthetics_locations must contain at least one whitespace-free Datadog location identifier when enable_synthetics is true."
  }
}

variable "synthetics_tick_every_seconds" {
  description = "Seconds between Synthetic API test executions when Synthetics is enabled."
  type        = number
  default     = 300

  validation {
    condition = (
      floor(var.synthetics_tick_every_seconds) == var.synthetics_tick_every_seconds &&
      contains([30, 60, 120, 300, 600, 900, 1800, 3600], var.synthetics_tick_every_seconds)
    )
    error_message = "synthetics_tick_every_seconds must be one of 30, 60, 120, 300, 600, 900, 1800, or 3600 seconds."
  }
}

variable "synthetics_response_time_critical_milliseconds" {
  description = "Maximum health-check response time accepted by the Synthetic API test."
  type        = number
  default     = 2000

  validation {
    condition = (
      var.synthetics_response_time_critical_milliseconds >= 100 &&
      var.synthetics_response_time_critical_milliseconds <= 10000 &&
      floor(var.synthetics_response_time_critical_milliseconds) == var.synthetics_response_time_critical_milliseconds
    )
    error_message = "synthetics_response_time_critical_milliseconds must be a whole number from 100 through 10000."
  }
}
