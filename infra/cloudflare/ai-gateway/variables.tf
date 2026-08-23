variable "environment" {
  description = "Persistent Cataquí environment whose AI Gateway Terraform manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production. Development remains manually managed."
  }
}
