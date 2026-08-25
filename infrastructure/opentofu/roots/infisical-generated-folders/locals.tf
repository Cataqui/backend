locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)

  cloudflare_opentofu_roots = var.environment == "production" ? toset([
    "cloudflare-ai-gateways",
    "cloudflare-queues",
    "cloudflare-zone-configuration",
    "cloudflare-zone-dns",
    ]) : toset([
    "cloudflare-ai-gateways",
    "cloudflare-queues",
  ])
}
