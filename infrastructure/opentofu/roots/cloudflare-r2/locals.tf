locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  mapshot_bucket_name   = regex("^[a-z0-9]+(?:-[a-z0-9]+)*$", local.manifest.cloudflare.r2.buckets["mapshot_${var.environment}"])
}
