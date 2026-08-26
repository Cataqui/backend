import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_zone_dnssec.cataqui
  id       = local.cloudflare_zone_id
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.framer_apex_primary
  id       = "${local.cloudflare_zone_id}/771c4788c6ae6442bad55923e7cf8425"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.framer_apex_secondary
  id       = "${local.cloudflare_zone_id}/3044984b4e7b338a810325fc97ba9231"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.framer_www
  id       = "${local.cloudflare_zone_id}/37a7a9eae1f4e6be3437458ab549463a"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.google_site_verification_primary
  id       = "${local.cloudflare_zone_id}/bdd8f815b32367dcba6ae81ed6a6a70e"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.google_site_verification_secondary
  id       = "${local.cloudflare_zone_id}/2147a67332a1b936d00b6d9044a5a608"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.cloudflare_email_routing_spf
  id       = "${local.cloudflare_zone_id}/6cde72c01e2a65638de179771a198c48"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.cloudflare_dmarc_reporting
  id       = "${local.cloudflare_zone_id}/e7e5d67758577763ae4ca2fcb17329e0"
}

import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = cloudflare_dns_record.github_organization_verification
  id       = "${local.cloudflare_zone_id}/08007eb19d33058671c4c6772a02a8d9"
}
