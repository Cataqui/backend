locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)

  gateways = {
    api = local.manifest.cloudflare.ai_gateways["api_${var.environment}"]
    ai  = local.manifest.cloudflare.ai_gateways["ai_${var.environment}"]
  }

  spend_limit = {
    staging    = 5
    production = 50
  }[var.environment]
}
