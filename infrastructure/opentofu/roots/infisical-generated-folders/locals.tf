locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id = module.infisical_project.id

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
