variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the AI Gateway."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hexadecimal Cloudflare account ID."
  }
}

variable "gateway_id" {
  description = "Existing AI Gateway identifier managed by this module."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9_]+(?:-[a-z0-9_]+)*$", var.gateway_id)) && length(var.gateway_id) <= 64
    error_message = "gateway_id must contain 1 to 64 lowercase letters, numbers, underscores, or single hyphens between segments."
  }
}

variable "configuration" {
  description = "Complete non-secret AI Gateway configuration using Cloudflare provider attribute names."
  type = object({
    authentication             = bool
    cache_invalidate_on_update = bool
    cache_ttl                  = number
    collect_logs               = bool
    log_management             = number
    log_management_strategy    = string
    logpush                    = bool
    rate_limiting_interval     = number
    rate_limiting_limit        = number
    rate_limiting_technique    = string
    retry_backoff              = string
    retry_delay                = number
    retry_max_attempts         = number
    spend_limits = object({
      enabled = bool
      rules = list(object({
        enabled    = bool
        id         = string
        limit      = number
        limit_type = string
        technique  = string
        window     = number
      }))
    })
    workers_ai_billing_mode = string
    zdr                     = bool
  })
  nullable = false

  validation {
    condition     = var.configuration.cache_ttl >= 0
    error_message = "configuration.cache_ttl must be zero or a positive number of seconds."
  }

  validation {
    condition     = var.configuration.log_management >= 10000 && var.configuration.log_management <= 10000000
    error_message = "configuration.log_management must be between Cloudflare's minimum of 10000 and maximum of 10000000 logs."
  }

  validation {
    condition     = contains(["STOP_INSERTING", "DELETE_OLDEST"], var.configuration.log_management_strategy)
    error_message = "configuration.log_management_strategy must be STOP_INSERTING or DELETE_OLDEST."
  }

  validation {
    condition     = var.configuration.rate_limiting_interval >= 0 && var.configuration.rate_limiting_limit >= 0
    error_message = "configuration.rate_limiting_interval and configuration.rate_limiting_limit must be zero or positive numbers."
  }

  validation {
    condition     = contains(["fixed", "sliding"], var.configuration.rate_limiting_technique)
    error_message = "configuration.rate_limiting_technique must be fixed or sliding."
  }

  validation {
    condition = (
      var.configuration.retry_backoff == null ||
      contains(["constant", "linear", "exponential"], var.configuration.retry_backoff)
    )
    error_message = "configuration.retry_backoff must be null, constant, linear, or exponential."
  }

  validation {
    condition = (
      var.configuration.retry_delay == null ||
      (var.configuration.retry_delay >= 0 && var.configuration.retry_delay <= 5000)
    )
    error_message = "configuration.retry_delay must be null or between 0 and 5000 milliseconds."
  }

  validation {
    condition = (
      var.configuration.retry_max_attempts == null ||
      (var.configuration.retry_max_attempts >= 1 && var.configuration.retry_max_attempts <= 5)
    )
    error_message = "configuration.retry_max_attempts must be null or between 1 and 5."
  }

  validation {
    condition = (
      alltrue([
        var.configuration.retry_backoff == null,
        var.configuration.retry_delay == null,
        var.configuration.retry_max_attempts == null,
      ]) ||
      alltrue([
        var.configuration.retry_backoff != null,
        var.configuration.retry_delay != null,
        var.configuration.retry_max_attempts != null,
      ])
    )
    error_message = "configuration retry_backoff, retry_delay, and retry_max_attempts must either all be null or all be configured."
  }

  validation {
    condition     = length(var.configuration.spend_limits.rules) <= 20
    error_message = "configuration.spend_limits.rules must contain no more than Cloudflare's maximum of 20 rules."
  }

  validation {
    condition = alltrue([
      for rule in var.configuration.spend_limits.rules :
      can(regex("^[a-zA-Z0-9_-]+$", rule.id)) &&
      rule.limit > 0 &&
      rule.limit_type == "cost" &&
      contains(["fixed", "sliding"], rule.technique) &&
      rule.window > 0
    ])
    error_message = "Every spend-limit rule must have a valid ID, a positive cost limit and window, limit_type cost, and technique fixed or sliding."
  }

  validation {
    condition     = var.configuration.workers_ai_billing_mode == "postpaid"
    error_message = "configuration.workers_ai_billing_mode must be postpaid, the only mode Cloudflare currently supports."
  }
}

# This variable is consumed by its validation blocks; TFLint does not count self-validation as usage.
# tflint-ignore: terraform_unused_declarations
variable "configuration_shape" {
  description = "Raw field names captured before Terraform converts configuration to its declared object type."
  type = object({
    top_level         = set(string)
    spend_limits      = set(string)
    spend_limit_rules = list(set(string))
  })
  nullable = false

  validation {
    condition = var.configuration_shape.top_level == toset([
      "authentication",
      "cache_invalidate_on_update",
      "cache_ttl",
      "collect_logs",
      "log_management",
      "log_management_strategy",
      "logpush",
      "rate_limiting_interval",
      "rate_limiting_limit",
      "rate_limiting_technique",
      "retry_backoff",
      "retry_delay",
      "retry_max_attempts",
      "spend_limits",
      "workers_ai_billing_mode",
      "zdr",
    ])
    error_message = "configuration must contain exactly the supported top-level AI Gateway fields; unknown fields are not allowed."
  }

  validation {
    condition = var.configuration_shape.spend_limits == toset([
      "enabled",
      "rules",
    ])
    error_message = "configuration.spend_limits must contain exactly enabled and rules; unknown fields are not allowed."
  }

  validation {
    condition = (
      length(var.configuration_shape.spend_limit_rules) ==
      length(var.configuration.spend_limits.rules)
    )
    error_message = "configuration_shape must describe every configuration.spend_limits.rules entry."
  }

  validation {
    condition = alltrue([
      for rule_fields in var.configuration_shape.spend_limit_rules : rule_fields == toset([
        "enabled",
        "id",
        "limit",
        "limit_type",
        "technique",
        "window",
      ])
    ])
    error_message = "Every configuration.spend_limits.rules entry must contain exactly enabled, id, limit, limit_type, technique, and window."
  }
}
