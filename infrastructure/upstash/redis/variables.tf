variable "environment" {
  description = "Persistent Cataquí environment whose Upstash Redis database Terraform manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production. Development remains manually managed."
  }
}
