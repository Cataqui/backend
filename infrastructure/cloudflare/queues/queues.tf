module "queue_pair" {
  for_each = local.queue_pairs

  source = "../modules/queue-pair"

  cloudflare_account_id  = local.cloudflare_account_id
  primary_queue_name     = "${each.value.base_name}-${var.environment}"
  dead_letter_queue_name = "${each.value.base_name}-${var.environment}-dlq"

  primary_message_retention_seconds     = each.value.primary_message_retention_seconds
  dead_letter_message_retention_seconds = each.value.dead_letter_message_retention_seconds

  depends_on = [terraform_data.queue_registry_shape]
}
