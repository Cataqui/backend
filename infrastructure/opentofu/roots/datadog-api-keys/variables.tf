variable "environment" {
  description = "Environment whose API runtime Datadog key is managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
