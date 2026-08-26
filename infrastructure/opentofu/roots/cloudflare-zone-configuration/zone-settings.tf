resource "cloudflare_zone_setting" "ssl" {
  setting_id = "ssl"
  value      = "strict"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "always_use_https" {
  setting_id = "always_use_https"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "minimum_tls_version" {
  setting_id = "min_tls_version"
  value      = "1.2"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "tls_1_3" {
  setting_id = "tls_1_3"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "zero_round_trip_time" {
  setting_id = "0rtt"
  value      = "off"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "automatic_https_rewrites" {
  setting_id = "automatic_https_rewrites"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "browser_integrity_check" {
  setting_id = "browser_check"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "security_level" {
  setting_id = "security_level"
  value      = "medium"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "strict_transport_security" {
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      include_subdomains = false
      max_age            = 2592000
      nosniff            = true
      preload            = false
    }
  }
  zone_id = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "http3" {
  setting_id = "http3"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "opportunistic_encryption" {
  setting_id = "opportunistic_encryption"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zone_setting" "ipv6" {
  setting_id = "ipv6"
  value      = "on"
  zone_id    = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_universal_ssl_setting" "cataqui" {
  enabled = true
  zone_id = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}

