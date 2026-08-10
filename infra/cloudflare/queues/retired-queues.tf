# Move the retired WhatsApp authentication Queues out of the protected shared
# module before removing them. The remaining registered Queues keep their
# prevent_destroy lifecycle through module.queue_pair.
resource "cloudflare_queue" "retired_whatsapp_auth_primary" {
  count = 0

  account_id = var.cloudflare_account_id
  queue_name = "cataqui-api-verify-whatsapp-auth-message-${var.environment}"
}

resource "cloudflare_queue" "retired_whatsapp_auth_dead_letter" {
  count = 0

  account_id = var.cloudflare_account_id
  queue_name = "cataqui-api-verify-whatsapp-auth-message-${var.environment}-dlq"
}

moved {
  from = module.queue_pair["verify_whatsapp_auth_message"].cloudflare_queue.primary
  to   = cloudflare_queue.retired_whatsapp_auth_primary[0]
}

moved {
  from = module.queue_pair["verify_whatsapp_auth_message"].cloudflare_queue.dead_letter
  to   = cloudflare_queue.retired_whatsapp_auth_dead_letter[0]
}
