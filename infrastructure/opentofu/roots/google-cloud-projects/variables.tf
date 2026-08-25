variable "environment" {
  description = "Environment whose isolated Google Cloud project is managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
