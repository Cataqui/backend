variable "environment" {
  description = "Environment whose isolated Cloudflare AI Gateway state is being managed."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
