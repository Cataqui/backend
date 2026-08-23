variable "environment" {
  description = "Cataquí environment whose independent Neon project Terraform manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production. Development databases are managed manually."
  }
}

variable "neon_organization_id" {
  description = "Neon organization that owns both Terraform-managed Cataquí database projects."
  type        = string

  validation {
    condition     = can(regex("^org-[a-z0-9-]+$", var.neon_organization_id))
    error_message = "neon_organization_id must be a Neon organization identifier beginning with org-."
  }
}
