locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  cataqui_zone_id       = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.zones["cataqui.com"].zone_id)
  infisical_project_id  = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)
  infisical_project_slug = regex(
    "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    local.platforms.infisical.project_slug,
  )

  permission_groups = {
    ai_gateway_read = {
      name  = "AI Gateway Read"
      scope = "com.cloudflare.api.account"
    }
    ai_gateway_write = {
      name  = "AI Gateway Write"
      scope = "com.cloudflare.api.account"
    }
    ai_gateway_run = {
      name  = "AI Gateway Run"
      scope = "com.cloudflare.api.account"
    }
    queues_read = {
      name  = "Queues Read"
      scope = "com.cloudflare.api.account"
    }
    queues_write = {
      name  = "Queues Write"
      scope = "com.cloudflare.api.account"
    }
    zone_read = {
      name  = "Zone Read"
      scope = "com.cloudflare.api.account.zone"
    }
    dns_read = {
      name  = "DNS Read"
      scope = "com.cloudflare.api.account.zone"
    }
    dns_write = {
      name  = "DNS Write"
      scope = "com.cloudflare.api.account.zone"
    }
    zone_settings_read = {
      name  = "Zone Settings Read"
      scope = "com.cloudflare.api.account.zone"
    }
    zone_settings_write = {
      name  = "Zone Settings Write"
      scope = "com.cloudflare.api.account.zone"
    }
    zone_waf_read = {
      name  = "Zone WAF Read"
      scope = "com.cloudflare.api.account.zone"
    }
    zone_waf_write = {
      name  = "Zone WAF Write"
      scope = "com.cloudflare.api.account.zone"
    }
    bot_management_read = {
      name  = "Bot Management Read"
      scope = "com.cloudflare.api.account.zone"
    }
    bot_management_write = {
      name  = "Bot Management Write"
      scope = "com.cloudflare.api.account.zone"
    }
    response_compression_read = {
      name  = "Response Compression Read"
      scope = "com.cloudflare.api.account.zone"
    }
    response_compression_write = {
      name  = "Response Compression Write"
      scope = "com.cloudflare.api.account.zone"
    }
    ssl_certificates_read = {
      name  = "SSL and Certificates Read"
      scope = "com.cloudflare.api.account.zone"
    }
    ssl_certificates_write = {
      name  = "SSL and Certificates Write"
      scope = "com.cloudflare.api.account.zone"
    }
  }

  common_infrastructure_tokens = {
    "cloudflare-ai-gateways/plan" = {
      root        = "cloudflare-ai-gateways"
      access      = "plan"
      permissions = ["ai_gateway_read"]
      scope       = "account"
    }
    "cloudflare-ai-gateways/apply" = {
      root        = "cloudflare-ai-gateways"
      access      = "apply"
      permissions = ["ai_gateway_write"]
      scope       = "account"
    }
    "cloudflare-queues/plan" = {
      root        = "cloudflare-queues"
      access      = "plan"
      permissions = ["queues_read"]
      scope       = "account"
    }
    "cloudflare-queues/apply" = {
      root        = "cloudflare-queues"
      access      = "apply"
      permissions = ["queues_write"]
      scope       = "account"
    }
  }

  production_infrastructure_tokens = {
    "cloudflare-zone-dns/plan" = {
      root        = "cloudflare-zone-dns"
      access      = "plan"
      permissions = ["zone_read", "dns_read"]
      scope       = "zone"
    }
    "cloudflare-zone-dns/apply" = {
      root        = "cloudflare-zone-dns"
      access      = "apply"
      permissions = ["zone_read", "dns_write"]
      scope       = "zone"
    }
    "cloudflare-zone-configuration/plan" = {
      root   = "cloudflare-zone-configuration"
      access = "plan"
      permissions = [
        "zone_read",
        "zone_settings_read",
        "zone_waf_read",
        "bot_management_read",
        "response_compression_read",
        "ssl_certificates_read",
      ]
      scope = "zone"
    }
    "cloudflare-zone-configuration/apply" = {
      root   = "cloudflare-zone-configuration"
      access = "apply"
      permissions = [
        "zone_read",
        "zone_settings_write",
        "zone_waf_write",
        "bot_management_write",
        "response_compression_write",
        "ssl_certificates_write",
      ]
      scope = "zone"
    }
  }

  infrastructure_tokens = merge(
    local.common_infrastructure_tokens,
    var.environment == "production" ? local.production_infrastructure_tokens : {},
  )
}
