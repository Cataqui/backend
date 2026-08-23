variable "environment" {
  description = "Persistent environment whose infrastructure Terraform manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production. Development uses Wrangler's local Queue emulation."
  }
}
