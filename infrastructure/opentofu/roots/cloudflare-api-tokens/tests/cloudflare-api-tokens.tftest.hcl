mock_provider "cloudflare" {
  mock_data "cloudflare_api_token_permission_groups_list" {
    defaults = {
      result = [{
        id     = "permission-group-id"
        name   = "mocked permission"
        scopes = ["mocked scope"]
      }]
    }
  }
}

mock_provider "infisical" {
  mock_data "infisical_projects" {
    defaults = {
      id     = "mock-project-id"
      name   = "Cataquí Backend"
      org_id = "33687647-d8e9-44a7-9cb9-721bd5b28a45"
      type   = "secret-manager"
      environments = {
        staging    = { id = "staging-id", name = "Staging", slug = "staging" }
        production = { id = "production-id", name = "Production", slug = "production" }
      }
    }
  }
}

run "staging_token_inventory" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = toset(keys(cloudflare_api_token.infrastructure)) == toset([
      "cloudflare-ai-gateways",
      "cloudflare-hyperdrive",
      "cloudflare-pages",
      "cloudflare-queues",
      "cloudflare-r2",
    ])
    error_message = "Staging must create one infrastructure token for each account-scoped Cloudflare root."
  }

  assert {
    condition = (
      length(infisical_secret.infrastructure_cloudflare_api_token) +
      length(infisical_secret.ai_gateway_api_token) +
      length(infisical_secret.application_deployment_cloudflare_api_token)
    ) == 11
    error_message = "Staging must deliver five infrastructure, one API runtime, and five application deployment tokens."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-ai-gateways"].name == "cataqui-opentofu-cloudflare-ai-gateways-staging" &&
      cloudflare_api_token.infrastructure["cloudflare-queues"].name == "cataqui-opentofu-cloudflare-queues-staging"
    )
    error_message = "Staging infrastructure tokens must use deterministic root-scoped names."
  }

  assert {
    condition = (
      toset(keys(cloudflare_api_token.ai_gateway_runtime)) == toset(["api"]) &&
      cloudflare_api_token.ai_gateway_runtime["api"].name == "cataqui-api-ai-gateway-staging"
    )
    error_message = "The staging AI Gateway runtime token must be owned by the API service."
  }


  assert {
    condition = (
      cloudflare_api_token.application_deployment["api"].name == "cataqui-api-workers-deployment-staging" &&
      cloudflare_api_token.application_deployment["maps"].name == "cataqui-maps-workers-deployment-staging" &&
      cloudflare_api_token.application_deployment["mapshot"].name == "cataqui-mapshot-workers-deployment-staging" &&
      cloudflare_api_token.application_deployment["auth"].name == "cataqui-auth-workers-deployment-staging" &&
      cloudflare_api_token.application_deployment["ai"].name == "cataqui-ai-workers-deployment-staging"
    )
    error_message = "Staging must create one deterministic Workers deployment token per application."
  }
}

run "production_token_inventory" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = length(cloudflare_api_token.infrastructure) == 7
    error_message = "Production must create one token for each Cloudflare root."
  }

  assert {
    condition = (
      length(infisical_secret.infrastructure_cloudflare_api_token) +
      length(infisical_secret.ai_gateway_api_token) +
      length(infisical_secret.application_deployment_cloudflare_api_token)
    ) == 13
    error_message = "Production must deliver seven infrastructure, one API runtime, and five application deployment tokens."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-zone-dns"].name == "cataqui-opentofu-cloudflare-zone-dns-production" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-configuration"].name == "cataqui-opentofu-cloudflare-zone-configuration-production" &&
      cloudflare_api_token.ai_gateway_runtime["api"].name == "cataqui-api-ai-gateway-production" &&
      cloudflare_api_token.application_deployment["api"].name == "cataqui-api-workers-deployment-production" &&
      cloudflare_api_token.application_deployment["maps"].name == "cataqui-maps-workers-deployment-production" &&
      cloudflare_api_token.application_deployment["mapshot"].name == "cataqui-mapshot-workers-deployment-production" &&
      cloudflare_api_token.application_deployment["auth"].name == "cataqui-auth-workers-deployment-production" &&
      cloudflare_api_token.application_deployment["ai"].name == "cataqui-ai-workers-deployment-production"
    )
    error_message = "Production zone and service-owned runtime tokens must use deterministic names."
  }
}

run "least_privilege_permissions" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      tolist(local.infrastructure_tokens["cloudflare-ai-gateways"].permissions) == tolist(["ai_gateway_read", "ai_gateway_write"]) &&
      tolist(local.infrastructure_tokens["cloudflare-queues"].permissions) == tolist(["queues_read", "queues_write"]) &&
      tolist(local.infrastructure_tokens["cloudflare-zone-dns"].permissions) == tolist(["zone_read", "dns_read", "dns_write"])
    )
    error_message = "AI Gateway, Queues, and DNS tokens must combine only their root's read and write permissions."
  }


  assert {
    condition = (
      tolist(local.worker_deployment_tokens.api.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "containers_read",
        "containers_write",
        "queues_read",
        "queues_write",
        "account_settings_read",
      ]) &&
      tolist(local.worker_deployment_tokens.maps.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      tolist(local.worker_deployment_tokens.auth.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      alltrue([
        for service, token in local.worker_deployment_tokens :
        service == "mapshot" ? length(token.zone_permissions) == 0 :
        tolist(token.zone_permissions) == tolist(["zone_read", "workers_routes_read", "workers_routes_write"])
      ])
    )
    error_message = "Application deployment tokens must contain only their approved account and zone permissions."
  }

  assert {
    condition = tolist(local.infrastructure_tokens["cloudflare-zone-configuration"].permissions) == tolist([
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
    ])
    error_message = "The zone configuration token must combine only the permissions required by its managed resources."
  }

  assert {
    condition = (
      data.cloudflare_api_token_permission_groups_list.required["ai_gateway_run"].name == "AI Gateway Run" &&
      data.cloudflare_api_token_permission_groups_list.required["ai_gateway_run"].scope == "com.cloudflare.api.account" &&
      data.cloudflare_api_token_permission_groups_list.required["workers_ai_read"].name == "Workers AI Read" &&
      data.cloudflare_api_token_permission_groups_list.required["workers_ai_read"].scope == "com.cloudflare.api.account" &&
      data.cloudflare_api_token_permission_groups_list.required["zone_waf_write"].name == "Zone WAF Write" &&
      data.cloudflare_api_token_permission_groups_list.required["zone_waf_write"].scope == "com.cloudflare.api.account.zone"
    )
    error_message = "Permission groups must be resolved by their plain provider names and exact scopes."
  }

  assert {
    condition = (
      length(cloudflare_api_token.ai_gateway_runtime["api"].policies[0].permission_groups) == 2 &&
      cloudflare_api_token.ai_gateway_runtime["api"].policies[0].permission_groups[0].id == one(data.cloudflare_api_token_permission_groups_list.required["ai_gateway_run"].result).id &&
      cloudflare_api_token.ai_gateway_runtime["api"].policies[0].permission_groups[1].id == one(data.cloudflare_api_token_permission_groups_list.required["workers_ai_read"].result).id
    )
    error_message = "The API runtime token must permit both gateway routing and Workers AI REST inference."
  }
}

run "maps_deployment_only_publishes_the_public_worker" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      length(cloudflare_api_token.application_deployment["maps"].policies[0].permission_groups) == 3 &&
      alltrue([
        for permission in ["r2_storage_read", "r2_storage_write", "containers_read", "containers_write"] :
        !contains(local.worker_deployment_tokens.maps.account_permissions, permission)
      ]) &&
      jsondecode(cloudflare_api_token.application_deployment["maps"].policies[0].resources) == {
        "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
      }
    )
    error_message = "Maps deployment must contain only its current Worker permissions in the Cataqui account, without R2 or Container access."
  }

  assert {
    condition = (
      data.cloudflare_api_token_permission_groups_list.required["workers_scripts_read"].name == "Workers Scripts Read" &&
      data.cloudflare_api_token_permission_groups_list.required["workers_scripts_write"].name == "Workers Scripts Write" &&
      data.cloudflare_api_token_permission_groups_list.required["account_settings_read"].name == "Account Settings Read" &&
      alltrue([
        for permission in ["workers_scripts_read", "workers_scripts_write", "account_settings_read"] :
        data.cloudflare_api_token_permission_groups_list.required[permission].scope == "com.cloudflare.api.account"
      ]) &&
      infisical_secret.application_deployment_cloudflare_api_token["maps"].env_slug == "staging" &&
      infisical_secret.application_deployment_cloudflare_api_token["maps"].folder_path == "/generated/maps/deployment"
    )
    error_message = "Maps deployment must resolve exact account-scoped permissions and deliver its credential only to the matching environment's Maps deployment folder."
  }
}

run "ai_deployment_credential" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      tolist(local.worker_deployment_tokens.ai.account_permissions) == tolist([
        "workers_scripts_read", "workers_scripts_write", "account_settings_read"
      ]) &&
      tolist(local.worker_deployment_tokens.ai.zone_permissions) == tolist([
        "zone_read", "workers_routes_read", "workers_routes_write"
      ]) &&
      length(cloudflare_api_token.application_deployment["ai"].policies) == 2 &&
      length(cloudflare_api_token.application_deployment["ai"].policies[0].permission_groups) == 3 &&
      length(cloudflare_api_token.application_deployment["ai"].policies[1].permission_groups) == 3 &&
      infisical_secret.application_deployment_cloudflare_api_token["ai"].env_slug == "staging" &&
      infisical_secret.application_deployment_cloudflare_api_token["ai"].folder_path == "/generated/ai/deployment" &&
      infisical_secret.application_deployment_cloudflare_api_token["ai"].name == "CLOUDFLARE_API_TOKEN" &&
      infisical_secret.application_deployment_cloudflare_api_token["ai"].value_wo_version == 1
    )
    error_message = "AI must receive only Worker deployment permissions and an environment-scoped deployment credential, without runtime or provider permissions."
  }
}

run "token_scopes_and_lifecycle" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = jsondecode(cloudflare_api_token.infrastructure["cloudflare-ai-gateways"].policies[0].resources) == {
      "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
      } && jsondecode(cloudflare_api_token.infrastructure["cloudflare-zone-dns"].policies[0].resources) == {
      "com.cloudflare.api.account.zone.0c75bfd5c20cdbb338d44e62bcde8acc" = "*"
    }
    error_message = "Account tokens and zone tokens must use their exact Cloudflare resource scopes."
  }

  assert {
    condition = alltrue([
      for service, token in cloudflare_api_token.application_deployment :
      jsondecode(token.policies[0].resources) == {
        "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
        } && (service == "mapshot" ? length(token.policies) == 1 : jsondecode(token.policies[1].resources) == {
          "com.cloudflare.api.account.zone.0c75bfd5c20cdbb338d44e62bcde8acc" = "*"
      })
    ])
    error_message = "Every application deployment token must be scoped to the exact account and cataqui.com zone."
  }

  assert {
    condition = alltrue(concat(
      [for token in values(cloudflare_api_token.infrastructure) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [for token in values(cloudflare_api_token.ai_gateway_runtime) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [for token in values(cloudflare_api_token.application_deployment) : token.status == "active" && token.expires_on == null && token.not_before == null],
    ))
    error_message = "Generated tokens must be active and remain unexpired until explicit rotation is introduced."
  }
}

run "write_only_infisical_delivery" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = alltrue([
      for token_key, secret in infisical_secret.infrastructure_cloudflare_api_token :
      secret.workspace_id == module.infisical_project.id &&
      secret.env_slug == "production" &&
      secret.folder_path == "/generated/opentofu/${token_key}" &&
      secret.name == "CLOUDFLARE_API_TOKEN" &&
      secret.value_wo_version == 1
    ])
    error_message = "Every infrastructure token must be delivered directly to its generated root folder."
  }

  assert {
    condition = alltrue([
      for service, secret in infisical_secret.ai_gateway_api_token :
      service == "api" &&
      secret.folder_path == "/generated/api/runtime" &&
      secret.name == "AI_GATEWAY_API_TOKEN" &&
      secret.value_wo_version == 1
    ])
    error_message = "The AI Gateway runtime token must be delivered through the API service's runtime contract."
  }


  assert {
    condition = alltrue([
      for service, secret in infisical_secret.application_deployment_cloudflare_api_token :
      secret.workspace_id == module.infisical_project.id &&
      secret.env_slug == "production" &&
      secret.folder_path == "/generated/${service}/deployment" &&
      secret.name == "CLOUDFLARE_API_TOKEN" &&
      secret.value_wo_version == 1
    ])
    error_message = "Each Workers token must be delivered write-only to its application's deployment folder."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

run "r2_management_credential" {
  command = plan
  variables {
    environment = "staging"
  }
  assert {
    condition = (
      local.common_infrastructure_tokens["cloudflare-r2"].permissions == ["r2_storage_read", "r2_storage_write"] &&
      local.common_infrastructure_tokens["cloudflare-r2"].scope == "account" &&
      local.permission_groups.r2_storage_read.name == "Workers R2 Storage Read" &&
      local.permission_groups.r2_storage_write.name == "Workers R2 Storage Write" &&
      local.permission_groups.r2_storage_read.scope == "com.cloudflare.api.account" &&
      local.permission_groups.r2_storage_write.scope == "com.cloudflare.api.account" &&
      cloudflare_api_token.infrastructure["cloudflare-r2"].name == "cataqui-opentofu-cloudflare-r2-staging" &&
      infisical_secret.infrastructure_cloudflare_api_token["cloudflare-r2"].folder_path == "/generated/opentofu/cloudflare-r2"
    )
    error_message = "R2 management must use exact account permissions and the dedicated environment-scoped credential path."
  }
}

run "pages_management_credential" {
  command = plan
  variables { environment = "staging" }
  assert {
    condition = (
      local.common_infrastructure_tokens["cloudflare-pages"].permissions == ["pages_read", "pages_write"] &&
      local.common_infrastructure_tokens["cloudflare-pages"].scope == "account" &&
      local.permission_groups.pages_read.name == "Pages Read" &&
      local.permission_groups.pages_write.name == "Pages Write" &&
      local.permission_groups.pages_read.scope == "com.cloudflare.api.account" &&
      local.permission_groups.pages_write.scope == "com.cloudflare.api.account" &&
      infisical_secret.infrastructure_cloudflare_api_token["cloudflare-pages"].folder_path == "/generated/opentofu/cloudflare-pages" &&
      infisical_secret.infrastructure_cloudflare_api_token["cloudflare-pages"].env_slug == "staging"
    )
    error_message = "Pages tokens must remain account-scoped backend infrastructure credentials in the selected Infisical environment."
  }
}

run "mapshot_private_deployment_credential" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      toset(keys(cloudflare_api_token.application_deployment)) == toset(["ai", "api", "maps", "mapshot", "auth"]) &&
      tolist(local.worker_deployment_tokens.mapshot.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "r2_storage_read",
        "containers_read",
        "containers_write",
        "account_settings_read",
      ]) &&
      length(local.worker_deployment_tokens.mapshot.zone_permissions) == 0 &&
      length(cloudflare_api_token.application_deployment["mapshot"].policies) == 1 &&
      length(cloudflare_api_token.application_deployment["mapshot"].policies[0].permission_groups) == 6 &&
      jsondecode(cloudflare_api_token.application_deployment["mapshot"].policies[0].resources) == {
        "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
      } &&
      infisical_secret.application_deployment_cloudflare_api_token["mapshot"].folder_path == "/generated/mapshot/deployment" &&
      infisical_secret.application_deployment_cloudflare_api_token["mapshot"].env_slug == "staging"
    )
    error_message = "Mapshot must own an environment-scoped credential for private Workers/Workflows and container deployment without zone or R2-write permissions."
  }
}

run "mapshot_staging_map_update_r2_credential" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      toset(keys(cloudflare_api_token.mapshot_r2)) == toset(["map-update", "deployment"]) &&
      cloudflare_api_token.mapshot_r2["map-update"].name == "cataqui-mapshot-map-update-r2-staging" &&
      tolist(local.mapshot_r2_tokens["map-update"].permissions) == tolist(["r2_bucket_item_read", "r2_bucket_item_write"]) &&
      length(cloudflare_api_token.mapshot_r2["map-update"].policies) == 1 &&
      jsondecode(cloudflare_api_token.mapshot_r2["map-update"].policies[0].resources) == {
        "com.cloudflare.edge.r2.bucket.1fca946385505503c59dd6a2a4eeb442_default_cataqui-mapshot-staging" = "*"
      } &&
      infisical_secret.mapshot_r2_access_key_id["map-update"].env_slug == "staging" &&
      infisical_secret.mapshot_r2_access_key_id["map-update"].folder_path == "/generated/mapshot/map-update" &&
      infisical_secret.mapshot_r2_access_key_id["map-update"].name == "MAPSHOT_R2_ACCESS_KEY_ID" &&
      infisical_secret.mapshot_r2_secret_access_key["map-update"].name == "MAPSHOT_R2_SECRET_ACCESS_KEY" &&
      infisical_secret.mapshot_r2_access_key_id["deployment"].folder_path == "/generated/mapshot/deployment" &&
      local.mapshot_r2_tokens.deployment.bucket == local.manifest.cloudflare.r2.buckets.mapshot_staging &&
      tolist(local.mapshot_r2_tokens.deployment.permissions) == tolist(["r2_bucket_item_read", "r2_bucket_item_write"])
    )
    error_message = "Preparation must receive staging-only object credentials with no access to production or bucket administration."
  }

  assert {
    condition = (
      data.cloudflare_api_token_permission_groups_list.required["r2_bucket_item_read"].name == "Workers R2 Storage Bucket Item Read" &&
      data.cloudflare_api_token_permission_groups_list.required["r2_bucket_item_write"].name == "Workers R2 Storage Bucket Item Write" &&
      data.cloudflare_api_token_permission_groups_list.required["r2_bucket_item_read"].scope == "com.cloudflare.edge.r2.bucket" &&
      data.cloudflare_api_token_permission_groups_list.required["r2_bucket_item_write"].scope == "com.cloudflare.edge.r2.bucket"
    )
    error_message = "R2 object credentials must resolve permission groups by plain names and exact bucket scopes."
  }
}

run "mapshot_production_deployment_credential_writes_production_and_reads_staging" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      toset(keys(cloudflare_api_token.mapshot_r2)) == toset(["deployment"]) &&
      tolist(local.mapshot_r2_tokens.deployment.permissions) == tolist(["r2_bucket_item_read", "r2_bucket_item_write"]) &&
      length(cloudflare_api_token.mapshot_r2["deployment"].policies) == 2 &&
      length(cloudflare_api_token.mapshot_r2["deployment"].policies[0].permission_groups) == 2 &&
      jsondecode(cloudflare_api_token.mapshot_r2["deployment"].policies[0].resources) == {
        "com.cloudflare.edge.r2.bucket.1fca946385505503c59dd6a2a4eeb442_default_cataqui-mapshot-production" = "*"
      } &&
      length(cloudflare_api_token.mapshot_r2["deployment"].policies[1].permission_groups) == 1 &&
      cloudflare_api_token.mapshot_r2["deployment"].policies[1].permission_groups[0].id == one(data.cloudflare_api_token_permission_groups_list.required["r2_bucket_item_read"].result).id &&
      jsondecode(cloudflare_api_token.mapshot_r2["deployment"].policies[1].resources) == { "com.cloudflare.edge.r2.bucket.1fca946385505503c59dd6a2a4eeb442_default_cataqui-mapshot-staging" = "*" } &&
      infisical_secret.mapshot_r2_access_key_id["deployment"].name == "MAPSHOT_R2_ACCESS_KEY_ID" &&
      infisical_secret.mapshot_r2_secret_access_key["deployment"].name == "MAPSHOT_R2_SECRET_ACCESS_KEY"
    )
    error_message = "Production deployment writes production and only reads staging."
  }

  assert {
    condition = alltrue(concat(
      [for secret in values(infisical_secret.mapshot_r2_access_key_id) : secret.env_slug == "production" && secret.folder_path == "/generated/mapshot/deployment" && secret.value_wo_version == 1],
      [for secret in values(infisical_secret.mapshot_r2_secret_access_key) : secret.env_slug == "production" && secret.folder_path == "/generated/mapshot/deployment" && secret.value_wo_version == 1],
    ))
    error_message = "Deployment R2 credentials must be delivered write-only into the production deployment folder."
  }
}
