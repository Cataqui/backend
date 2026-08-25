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

  cloudflare_opentofu_access_folders = {
    for folder in flatten([
      for root_name in local.cloudflare_opentofu_roots : [
        { root_name = root_name, access = "plan" },
        { root_name = root_name, access = "apply" },
      ]
    ]) : "${folder.root_name}/${folder.access}" => folder
  }
}
