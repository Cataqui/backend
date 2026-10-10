locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  opentofu_state_bucket = regex("^[a-z0-9]+(?:-[a-z0-9]+)*$", local.manifest.cloudflare.r2.buckets.opentofu_state)
  infisical_project_id  = module.infisical_project.id
  google_cloud_project_id = regex(
    "^[a-z][a-z0-9-]{4,28}[a-z0-9]$",
    data.terraform_remote_state.google_cloud_projects.outputs.project_id,
  )

  maps_platform_services = toset([
    "apikeys.googleapis.com",
    "places.googleapis.com",
  ])
}
