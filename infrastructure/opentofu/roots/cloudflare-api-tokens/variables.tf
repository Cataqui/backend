variable "environment" {
  description = "Environment whose Cloudflare API tokens are being managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
