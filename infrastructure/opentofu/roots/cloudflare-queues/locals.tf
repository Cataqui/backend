locals {
  platforms             = jsondecode(file("${path.module}/../../../platforms.json"))
  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
}
