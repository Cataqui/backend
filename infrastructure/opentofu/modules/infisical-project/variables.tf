variable "organization_id" {
  type        = string
  description = "Expected Infisical organization ID."

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.organization_id))
    error_message = "organization_id must be a lowercase UUID."
  }
}

variable "project_name" {
  type        = string
  description = "Expected Infisical project name."

  validation {
    condition     = trimspace(var.project_name) != ""
    error_message = "project_name must not be empty."
  }
}

variable "project_slug" {
  type        = string
  description = "Stable Infisical project slug used for lookup."

  validation {
    condition     = can(regex("^[a-z0-9]+(?:-[a-z0-9]+)*$", var.project_slug))
    error_message = "project_slug must be a lowercase slug."
  }
}

variable "environment" {
  type        = string
  description = "Infisical environment that must exist in the project."

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
