locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id = module.infisical_project.id

  mapshot_pipeline_folders = var.environment == "staging" ? {
    map-update = "Staging-only R2 credentials consumed by Mapshot map updates."
  } : {}

  cloudflare_opentofu_roots = var.environment == "production" ? toset([
    "cloudflare-ai-gateways",
    "cloudflare-hyperdrive",
    "cloudflare-pages",
    "cloudflare-queues",
    "cloudflare-r2",
    "cloudflare-zone-configuration",
    "cloudflare-zone-dns",
    ]) : toset([
    "cloudflare-ai-gateways",
    "cloudflare-hyperdrive",
    "cloudflare-pages",
    "cloudflare-queues",
    "cloudflare-r2",
  ])
}
