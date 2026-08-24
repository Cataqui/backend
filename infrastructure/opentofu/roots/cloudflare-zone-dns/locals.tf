locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  cloudflare_zone_id    = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.zones["cataqui.com"].zone_id)
}
