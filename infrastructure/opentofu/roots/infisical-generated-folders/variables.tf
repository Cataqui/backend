variable "environment" {
  description = "Infisical environment whose generated-value folder structure is managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
