locals {
  cloudflare_account_id = "1fca946385505503c59dd6a2a4eeb442"
  queue_pairs           = jsondecode(file("${path.module}/queues.json"))
}

resource "terraform_data" "queue_registry_shape" {
  input = local.queue_pairs

  lifecycle {
    precondition {
      condition = alltrue([
        for queue_pair in values(local.queue_pairs) : toset(keys(queue_pair)) == toset(
          [
            "base_name",
            "primary_message_retention_seconds",
            "dead_letter_message_retention_seconds",
          ]
        )
      ])
      error_message = "Every queues.json entry must contain exactly base_name, primary_message_retention_seconds, and dead_letter_message_retention_seconds."
    }
  }
}
