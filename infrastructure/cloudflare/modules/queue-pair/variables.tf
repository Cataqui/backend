variable "cloudflare_account_id" {
  description = "Cloudflare account that owns Queues."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hexadecimal Cloudflare account ID."
  }
}

variable "primary_queue_name" {
  description = "Name of the Queue that receives application messages."
  type        = string

  validation {
    condition     = length(trimspace(var.primary_queue_name)) > 0
    error_message = "primary_queue_name must contain at least one non-whitespace character."
  }
}

variable "dead_letter_queue_name" {
  description = "Name of the Queue that receives messages after retries are exhausted."
  type        = string

  validation {
    condition     = length(trimspace(var.dead_letter_queue_name)) > 0
    error_message = "dead_letter_queue_name must contain at least one non-whitespace character."
  }
}

variable "primary_message_retention_seconds" {
  description = "Number of seconds an unconsumed primary Queue message is retained."
  type        = number

  validation {
    condition     = var.primary_message_retention_seconds >= 60 && var.primary_message_retention_seconds <= 1209600
    error_message = "primary_message_retention_seconds must be between 60 seconds and Cloudflare's 14-day maximum of 1209600 seconds."
  }
}

variable "dead_letter_message_retention_seconds" {
  description = "Number of seconds a dead-letter Queue message is retained for investigation and replay."
  type        = number

  validation {
    condition     = var.dead_letter_message_retention_seconds >= 60 && var.dead_letter_message_retention_seconds <= 1209600
    error_message = "dead_letter_message_retention_seconds must be between 60 seconds and Cloudflare's 14-day maximum of 1209600 seconds."
  }
}
