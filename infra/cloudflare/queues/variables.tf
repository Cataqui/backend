variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the API infrastructure."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hexadecimal Cloudflare account ID."
  }
}

variable "environment" {
  description = "Persistent environment whose infrastructure Terraform manages."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production. Development uses Wrangler's local Queue emulation."
  }
}
