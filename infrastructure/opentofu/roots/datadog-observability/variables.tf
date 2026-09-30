variable "environment" {
  description = "Environment whose API monitors, health check, and dashboard are managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
