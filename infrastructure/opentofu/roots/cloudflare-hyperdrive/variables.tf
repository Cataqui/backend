variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
variable "database_host" {
  type = string
  validation {
    condition     = can(regex("^ep-[a-z0-9-]+\\.[a-z0-9.-]+\\.neon\\.tech$", var.database_host)) && !strcontains(var.database_host, "-pooler.")
    error_message = "Hyperdrive requires the direct Neon endpoint."
  }
}
variable "database_password" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.database_password) >= 32
    error_message = "Auth database runtime password must contain at least 32 characters."
  }
}
