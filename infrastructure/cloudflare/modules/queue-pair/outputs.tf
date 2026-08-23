output "primary_queue_name" {
  description = "Name of the primary Queue."
  value       = cloudflare_queue.primary.queue_name
}

output "dead_letter_queue_name" {
  description = "Name of the dead-letter Queue."
  value       = cloudflare_queue.dead_letter.queue_name
}

output "primary_message_retention_seconds" {
  description = "Number of seconds an unconsumed primary Queue message is retained."
  value       = cloudflare_queue.primary.settings.message_retention_period
}

output "dead_letter_message_retention_seconds" {
  description = "Number of seconds a dead-letter Queue message is retained."
  value       = cloudflare_queue.dead_letter.settings.message_retention_period
}
