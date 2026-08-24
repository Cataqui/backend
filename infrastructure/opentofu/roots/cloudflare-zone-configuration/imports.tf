import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_ruleset.custom
  id       = "zones/${local.cloudflare_zone_id}/1b2257ab139d4cc0bffd2dae645543aa"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_ruleset.managed_waf
  id       = "zones/${local.cloudflare_zone_id}/1decd5c88e054dfc80115bc79657b2e7"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_ruleset.rate_limits
  id       = "zones/${local.cloudflare_zone_id}/5b31aefb0aa04963a54b2ebb465ab226"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_ruleset.response_compression
  id       = "zones/${local.cloudflare_zone_id}/b26d60d1beb5415f91780347f5d1c567"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_bot_management.cataqui
  id       = local.cloudflare_zone_id
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.zero_round_trip_time
  id       = "${local.cloudflare_zone_id}/0rtt"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.always_use_https
  id       = "${local.cloudflare_zone_id}/always_use_https"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.automatic_https_rewrites
  id       = "${local.cloudflare_zone_id}/automatic_https_rewrites"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.browser_integrity_check
  id       = "${local.cloudflare_zone_id}/browser_check"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.http3
  id       = "${local.cloudflare_zone_id}/http3"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.ipv6
  id       = "${local.cloudflare_zone_id}/ipv6"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.minimum_tls_version
  id       = "${local.cloudflare_zone_id}/min_tls_version"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.opportunistic_encryption
  id       = "${local.cloudflare_zone_id}/opportunistic_encryption"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.security_level
  id       = "${local.cloudflare_zone_id}/security_level"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.ssl
  id       = "${local.cloudflare_zone_id}/ssl"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.tls_1_3
  id       = "${local.cloudflare_zone_id}/tls_1_3"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_setting.strict_transport_security
  id       = "${local.cloudflare_zone_id}/security_header"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_universal_ssl_setting.cataqui
  id       = local.cloudflare_zone_id
}
