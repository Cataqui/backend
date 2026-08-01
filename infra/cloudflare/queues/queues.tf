module "queue_pair" {
  for_each = local.queue_pairs

  source = "../modules/queue-pair"

  cloudflare_account_id  = var.cloudflare_account_id
  primary_queue_name     = "${each.value.base_name}-${var.environment}"
  dead_letter_queue_name = "${each.value.base_name}-${var.environment}-dlq"

  primary_message_retention_seconds     = 345600
  dead_letter_message_retention_seconds = 1209600
}
