resource "cloudflare_queue" "primary" {
  for_each = local.queue_families

  account_id = local.cloudflare_account_id
  queue_name = "${each.value.base_name}-${var.environment}"
  settings = {
    message_retention_period = each.value.primary_retention_period
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "dead_letter" {
  for_each = local.queue_families

  account_id = local.cloudflare_account_id
  queue_name = "${each.value.base_name}-${var.environment}-dlq"
  settings = {
    message_retention_period = each.value.dead_letter_retention_period
  }

  lifecycle {
    prevent_destroy = true
  }
}
