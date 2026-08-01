locals {
  queue_pairs = jsondecode(file("${path.module}/queues.json"))
}
