data "cloudflare_zone" "cataqui" {
  zone_id = local.cloudflare_zone_id

  lifecycle {
    postcondition {
      condition = (
        self.account.id == local.cloudflare_account_id &&
        self.id == local.cloudflare_zone_id &&
        self.name == "cataqui.com" &&
        self.status == "active"
      )
      error_message = "The platform manifest must identify the active cataqui.com zone before its DNS can be managed."
    }
  }
}

locals {
  cataqui_zone_id = data.cloudflare_zone.cataqui.id
}
