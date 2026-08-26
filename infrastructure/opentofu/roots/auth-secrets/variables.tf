variable "environment" {
  description = "Environment whose runtime authentication secrets are generated."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
