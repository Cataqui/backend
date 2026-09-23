mock_provider "cloudflare" {}

variables {
  enable_imports = false
}

override_data {
  target = data.cloudflare_zone.cataqui
  values = {
    account = {
      id   = "1fca946385505503c59dd6a2a4eeb442"
      name = "Ventairy"
    }
    id     = "0c75bfd5c20cdbb338d44e62bcde8acc"
    name   = "cataqui.com"
    status = "active"
  }
}

override_resource {
  target = cloudflare_ruleset.custom
}

override_resource {
  target = cloudflare_ruleset.managed_waf
}

override_resource {
  target = cloudflare_ruleset.rate_limits
}

override_resource {
  target = cloudflare_ruleset.response_compression
}

override_resource {
  target = cloudflare_bot_management.cataqui
}

override_resource {
  target = cloudflare_zone_setting.zero_round_trip_time
}

override_resource {
  target = cloudflare_zone_setting.always_use_https
}

override_resource {
  target = cloudflare_zone_setting.automatic_https_rewrites
}

override_resource {
  target = cloudflare_zone_setting.browser_integrity_check
}

override_resource {
  target = cloudflare_zone_setting.http3
}

override_resource {
  target = cloudflare_zone_setting.ipv6
}

override_resource {
  target = cloudflare_zone_setting.minimum_tls_version
}

override_resource {
  target = cloudflare_zone_setting.opportunistic_encryption
}

override_resource {
  target = cloudflare_zone_setting.security_level
}

override_resource {
  target = cloudflare_zone_setting.ssl
}

override_resource {
  target = cloudflare_zone_setting.tls_1_3
}

override_resource {
  target = cloudflare_zone_setting.strict_transport_security
}

override_resource {
  target = cloudflare_universal_ssl_setting.cataqui
}

run "owns_the_intentional_zone_configuration" {
  command = plan

  assert {
    condition = (
      length(cloudflare_ruleset.custom.rules) == 7 &&
      length(cloudflare_ruleset.managed_waf.rules) == 1 &&
      length(cloudflare_ruleset.rate_limits.rules) == 5 &&
      length(cloudflare_ruleset.response_compression.rules) == 1 &&
      cloudflare_zone_setting.http3.value == "on" &&
      cloudflare_zone_setting.opportunistic_encryption.value == "on" &&
      cloudflare_zone_setting.ipv6.value == "on" &&
      cloudflare_universal_ssl_setting.cataqui.enabled
    )
    error_message = "The root must own the complete intentional zone-configuration boundary."
  }
}

run "preserves_transport_and_network_baseline" {
  command = plan

  assert {
    condition = (
      cloudflare_zone_setting.ssl.value == "strict" &&
      cloudflare_zone_setting.always_use_https.value == "on" &&
      cloudflare_zone_setting.minimum_tls_version.value == "1.2" &&
      cloudflare_zone_setting.tls_1_3.value == "on" &&
      cloudflare_zone_setting.zero_round_trip_time.value == "off" &&
      cloudflare_zone_setting.automatic_https_rewrites.value == "on" &&
      cloudflare_zone_setting.browser_integrity_check.value == "on" &&
      cloudflare_zone_setting.security_level.value == "medium" &&
      cloudflare_zone_setting.http3.value == "on" &&
      cloudflare_zone_setting.opportunistic_encryption.value == "on" &&
      cloudflare_zone_setting.ipv6.value == "on" &&
      cloudflare_zone_setting.strict_transport_security.value.strict_transport_security.enabled &&
      cloudflare_zone_setting.strict_transport_security.value.strict_transport_security.max_age == 2592000 &&
      !cloudflare_zone_setting.strict_transport_security.value.strict_transport_security.include_subdomains &&
      !cloudflare_zone_setting.strict_transport_security.value.strict_transport_security.preload &&
      cloudflare_zone_setting.strict_transport_security.value.strict_transport_security.nosniff
    )
    error_message = "The transport, browser, and network settings must match the audited live baseline."
  }
}

run "keeps_geosearch_health_reachable_without_browser_challenges" {
  command = plan

  assert {
    condition = (
      cloudflare_bot_management.cataqui.ai_bots_protection == "block" &&
      cloudflare_bot_management.cataqui.content_bots_protection == "disabled" &&
      cloudflare_bot_management.cataqui.crawler_protection == "enabled" &&
      !cloudflare_bot_management.cataqui.enable_js &&
      !cloudflare_bot_management.cataqui.is_robots_txt_managed &&
      cloudflare_bot_management.cataqui.sbfm_definitely_automated == "block" &&
      cloudflare_bot_management.cataqui.sbfm_likely_automated == "managed_challenge" &&
      cloudflare_bot_management.cataqui.sbfm_verified_bots == "allow" &&
      !cloudflare_bot_management.cataqui.sbfm_static_resource_protection &&
      cloudflare_ruleset.custom.rules[6].ref == "skip_sbfm_for_non_browser_traffic" &&
      cloudflare_ruleset.custom.rules[6].action == "skip" &&
      cloudflare_ruleset.custom.rules[6].expression == "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\" \"geosearch.cataqui.com\" \"staging.geosearch.cataqui.com\" \"webhooks.cataqui.com\" \"staging.webhooks.cataqui.com\"}" &&
      cloudflare_ruleset.custom.rules[6].action_parameters.phases == tolist(["http_request_sbfm"]) &&
      cloudflare_ruleset.custom.rules[6].action_parameters.products == tolist(["bic"])
    )
    error_message = "Bot protections and the API, Geosearch, and Webhooks SBFM exception must match the live configuration."
  }
}

run "preserves_custom_waf_order_and_contracts" {
  command = plan

  assert {
    condition = [
      for rule in cloudflare_ruleset.custom.rules : rule.ref
      ] == [
      "d3e8252afe7746e7b3d2beeef2bf7c4b",
      "block_malformed_whatsapp_delivery",
      "block_private_api_routes",
      "44a35aef2c7e4a5a9f6b12bf742166bb",
      "04a6654bc52f42cabb0daf37726012ee",
      "3fd61308042e43c18464f8e943a60763",
      "skip_sbfm_for_non_browser_traffic",
    ]
    error_message = "Custom WAF rules must preserve every live ref and evaluation order."
  }

  assert {
    condition = (
      strcontains(cloudflare_ruleset.custom.rules[1].expression, "application/json") &&
      strcontains(cloudflare_ruleset.custom.rules[1].expression, "x-hub-signature-256")
    )
    error_message = "The WhatsApp request contract must remain protected."
  }
}

run "keeps_api_media_type_validation_out_of_the_waf" {
  command = plan

  assert {
    condition = !contains(
      [for rule in cloudflare_ruleset.custom.rules : rule.ref],
      "cc18571df63646d482095c03e1774138",
    )
    error_message = "API media type validation belongs to the application parser, not a method-wide WAF rule."
  }
}

run "preserves_managed_waf_and_rate_limits" {
  command = plan

  assert {
    condition = (
      cloudflare_ruleset.managed_waf.rules[0].action == "execute" &&
      cloudflare_ruleset.managed_waf.rules[0].action_parameters.id == "efb7b8c949ac4650a09736fc376e9aee" &&
      cloudflare_ruleset.managed_waf.rules[0].ref == "execute_cloudflare_managed_ruleset" &&
      strcontains(cloudflare_ruleset.managed_waf.rules[0].expression, "/whatsapp")
    )
    error_message = "The managed WAF and authenticated WhatsApp exception must remain intact."
  }

  assert {
    condition = (
      cloudflare_ruleset.rate_limits.rules[0].ref == "rate_limit_public_contact_lookup" &&
      strcontains(cloudflare_ruleset.rate_limits.rules[0].expression, "/v1/contacts/") &&
      cloudflare_ruleset.rate_limits.rules[0].ratelimit.requests_per_period == 120 &&
      cloudflare_ruleset.rate_limits.rules[1].ref == "rate_limit_notp_intent_creation" &&
      cloudflare_ruleset.rate_limits.rules[1].ratelimit.requests_per_period == 60 &&
      cloudflare_ruleset.rate_limits.rules[2].ref == "rate_limit_api_health_checks" &&
      !cloudflare_ruleset.rate_limits.rules[2].enabled &&
      cloudflare_ruleset.rate_limits.rules[3].ref == "rate_limit_whatsapp_webhook_delivery" &&
      cloudflare_ruleset.rate_limits.rules[3].ratelimit.requests_per_period == 300 &&
      cloudflare_ruleset.rate_limits.rules[4].ref == "rate_limit_total_api_traffic" &&
      !cloudflare_ruleset.rate_limits.rules[4].enabled &&
      alltrue([
        for rule in cloudflare_ruleset.rate_limits.rules :
        rule.action == "block" &&
        rule.action_parameters.response.status_code == 429 &&
        jsondecode(rule.action_parameters.response.content).errorCode == "RATE_LIMITED" &&
        rule.ratelimit.period == 60 &&
        rule.ratelimit.requests_to_origin
      ])
    )
    error_message = "Rate-limit order, ceilings, response contracts, and disabled shared-IP limits must remain intact."
  }
}

run "preserves_api_response_compression" {
  command = plan

  assert {
    condition = (
      cloudflare_ruleset.response_compression.phase == "http_response_compression" &&
      cloudflare_ruleset.response_compression.rules[0].action == "compress_response" &&
      cloudflare_ruleset.response_compression.rules[0].expression == "(http.host contains \"api\")" &&
      cloudflare_ruleset.response_compression.rules[0].ref == "2962c2a81ba74c14b542530285a16ba4" &&
      [
        for algorithm in cloudflare_ruleset.response_compression.rules[0].action_parameters.algorithms :
        algorithm.name
      ] == ["zstd", "brotli", "gzip", "auto"]
    )
    error_message = "API response compression must preserve its live expression and algorithm order."
  }
}
