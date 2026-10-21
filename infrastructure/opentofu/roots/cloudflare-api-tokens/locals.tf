locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  cataqui_zone_id       = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.zones["cataqui.com"].zone_id)
  infisical_project_id  = module.infisical_project.id

  permission_groups = {
    hyperdrive_read = {
      name  = "Hyperdrive Read"
      scope = "com.cloudflare.api.account"
    }
    hyperdrive_write = {
      name  = "Hyperdrive Write"
      scope = "com.cloudflare.api.account"
    }
    pages_read = {
      name  = "Pages Read"
      scope = "com.cloudflare.api.account"
    }
    pages_write = {
      name  = "Pages Write"
      scope = "com.cloudflare.api.account"
    }
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
    workers_ai_read = {
      name  = "Workers AI Read"
      scope = "com.cloudflare.api.account"
    }
    r2_storage_read = {
      name  = "Workers R2 Storage Read"
      scope = "com.cloudflare.api.account"
    }
    r2_storage_write = {
      name  = "Workers R2 Storage Write"
      scope = "com.cloudflare.api.account"
    }
    r2_bucket_item_read = {
      name  = "Workers R2 Storage Bucket Item Read"
      scope = "com.cloudflare.edge.r2.bucket"
    }
    r2_bucket_item_write = {
      name  = "Workers R2 Storage Bucket Item Write"
      scope = "com.cloudflare.edge.r2.bucket"
    }
    queues_read = {
      name  = "Queues Read"
      scope = "com.cloudflare.api.account"
    }
    queues_write = {
      name  = "Queues Write"
      scope = "com.cloudflare.api.account"
    }
    workers_scripts_read = {
      name  = "Workers Scripts Read"
      scope = "com.cloudflare.api.account"
    }
    workers_scripts_write = {
      name  = "Workers Scripts Write"
      scope = "com.cloudflare.api.account"
    }
    containers_read = {
      name  = "Workers Containers Read"
      scope = "com.cloudflare.api.account"
    }
    containers_write = {
      name  = "Workers Containers Write"
      scope = "com.cloudflare.api.account"
    }
    account_settings_read = {
      name  = "Account Settings Read"
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
    workers_routes_read = {
      name  = "Workers Routes Read"
      scope = "com.cloudflare.api.account.zone"
    }
    workers_routes_write = {
      name  = "Workers Routes Write"
      scope = "com.cloudflare.api.account.zone"
    }
    dynamic_url_redirects_read = {
      name  = "Dynamic URL Redirects Read"
      scope = "com.cloudflare.api.account.zone"
    }
    dynamic_url_redirects_write = {
      name  = "Dynamic URL Redirects Write"
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
    cloudflare-hyperdrive = {
      permissions = ["hyperdrive_read", "hyperdrive_write"]
      scope       = "account"
    }
    cloudflare-pages = {
      permissions = ["pages_read", "pages_write"]
      scope       = "account"
    }
    cloudflare-r2 = {
      permissions = ["r2_storage_read", "r2_storage_write"]
      scope       = "account"
    }
    cloudflare-ai-gateways = {
      permissions = ["ai_gateway_read", "ai_gateway_write"]
      scope       = "account"
    }
    cloudflare-queues = {
      permissions = ["queues_read", "queues_write"]
      scope       = "account"
    }
  }

  production_infrastructure_tokens = {
    cloudflare-zone-dns = {
      permissions = ["zone_read", "dns_read", "dns_write"]
      scope       = "zone"
    }
    cloudflare-zone-configuration = {
      permissions = [
        "zone_read",
        "dynamic_url_redirects_read",
        "dynamic_url_redirects_write",
        "zone_settings_read",
        "zone_settings_write",
        "zone_waf_read",
        "zone_waf_write",
        "bot_management_read",
        "bot_management_write",
        "response_compression_read",
        "response_compression_write",
        "ssl_certificates_read",
        "ssl_certificates_write",
      ]
      scope = "zone"
    }
  }

  infrastructure_tokens = merge(
    local.common_infrastructure_tokens,
    var.environment == "production" ? local.production_infrastructure_tokens : {},
  )

  ai_gateway_runtime_tokens = {
    api = {
      folder_path = "/generated/api/runtime"
      secret_name = "AI_GATEWAY_API_TOKEN"
    }
  }

  worker_deployment_tokens = {
    api = {
      account_permissions = [
        "workers_scripts_read",
        "workers_scripts_write",
        "containers_read",
        "containers_write",
        "queues_read",
        "queues_write",
        "account_settings_read",
      ]
      zone_permissions = ["zone_read", "workers_routes_read", "workers_routes_write"]
      folder_path      = "/generated/api/deployment"
    }
    mapshot = {
      account_permissions = [
        "workers_scripts_read",
        "workers_scripts_write",
        "r2_storage_read",
        "containers_read",
        "containers_write",
        "account_settings_read",
      ]
      zone_permissions = []
      folder_path      = "/generated/mapshot/deployment"
    }
    maps = {
      account_permissions = [
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]
      zone_permissions = ["zone_read", "workers_routes_read", "workers_routes_write"]
      folder_path      = "/generated/maps/deployment"
    }
    auth = {
      account_permissions = ["workers_scripts_read", "workers_scripts_write", "account_settings_read"]
      zone_permissions    = ["zone_read", "workers_routes_read", "workers_routes_write"]
      folder_path         = "/generated/auth/deployment"
    }
  }

  mapshot_r2_tokens = merge(
    {
      deployment = {
        bucket = (
          var.environment == "staging" ?
          local.manifest.cloudflare.r2.buckets.mapshot_staging :
          local.manifest.cloudflare.r2.buckets.mapshot_production
        )
        copy_source_bucket = var.environment == "production" ? local.manifest.cloudflare.r2.buckets.mapshot_staging : null
        permissions        = ["r2_bucket_item_read", "r2_bucket_item_write"]
        folder_path        = "/generated/mapshot/deployment"
      }
    },
    var.environment == "staging" ? {
      map-update = {
        bucket             = local.manifest.cloudflare.r2.buckets.mapshot_staging
        copy_source_bucket = null
        permissions        = ["r2_bucket_item_read", "r2_bucket_item_write"]
        folder_path        = "/generated/mapshot/map-update"
      }
    } : {},
  )
}
