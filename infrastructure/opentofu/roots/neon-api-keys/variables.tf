variable "environment" {
  description = "Environment whose project-scoped Neon API key is managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "neon_project_id" {
  description = "Non-secret Neon project ID created by neon-projects."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]+(?:-[a-z0-9]+)+$", var.neon_project_id))
    error_message = "neon_project_id must be a valid lowercase Neon project ID."
  }
}
