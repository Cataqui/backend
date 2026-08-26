variable "environment" {
  description = "Environment whose isolated database access policy is managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
