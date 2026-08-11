resource "cloudflare_queue" "primary" {
  account_id = var.cloudflare_account_id
  queue_name = var.primary_queue_name
  settings = {
    message_retention_period = var.primary_message_retention_seconds
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "dead_letter" {
  account_id = var.cloudflare_account_id
  queue_name = var.dead_letter_queue_name
  settings = {
    message_retention_period = var.dead_letter_message_retention_seconds
  }

  lifecycle {
    prevent_destroy = true
  }
}
