output "queue_names" {
  description = "Primary and dead-letter Queue names keyed by their application purpose."
  value = {
    for name, queue_pair in module.queue_pair : name => {
      primary     = queue_pair.primary_queue_name
      dead_letter = queue_pair.dead_letter_queue_name
    }
  }
}
