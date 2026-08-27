variable "resource_id" {
  description = "Complete Datadog restriction-policy resource identifier."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^(monitor|slo|synthetics-test):[A-Za-z0-9_-]+$", var.resource_id))
    error_message = "resource_id must identify one monitor, SLO, or Synthetic test using Datadog's <resource-type>:<resource-id> syntax."
  }
}

variable "viewer_principals" {
  description = "Datadog organization principals that retain viewer access."
  type        = set(string)
  nullable    = false

  validation {
    condition = (
      length(var.viewer_principals) > 0 &&
      alltrue([
        for principal in var.viewer_principals :
        can(regex("^org:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", principal))
      ])
    )
    error_message = "viewer_principals must contain at least one Datadog organization principal backed by a lowercase RFC 4122 UUID."
  }
}

variable "editor_principals" {
  description = "Datadog role principals whose members may edit the protected resource."
  type        = set(string)
  nullable    = false

  validation {
    condition = (
      length(var.editor_principals) > 0 &&
      alltrue([
        for principal in var.editor_principals :
        can(regex("^role:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", principal))
      ])
    )
    error_message = "editor_principals must contain at least one Datadog role principal backed by a lowercase RFC 4122 UUID."
  }
}
