locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  project_name          = local.manifest.cloudflare.pages["landing_${var.environment}"].name
  branch                = var.environment == "staging" ? "staging" : "main"
  domains               = var.environment == "staging" ? toset(["staging.cataqui.com"]) : toset(["cataqui.com", "www.cataqui.com"])
}
