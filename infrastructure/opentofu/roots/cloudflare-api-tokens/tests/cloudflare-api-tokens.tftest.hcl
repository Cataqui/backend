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
      "cloudflare-queues",
      "cloudflare-r2",
    ])
    error_message = "Staging must create one infrastructure token for each account-scoped Cloudflare root."
  }

  assert {
    condition = (
      length(infisical_secret.infrastructure_cloudflare_api_token) +
      length(infisical_secret.ai_gateway_api_token) +
      length(infisical_secret.worker_deployment_cloudflare_api_token)
    ) == 9
    error_message = "Staging must deliver three infrastructure, one API runtime, and four application deployment tokens."
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
      cloudflare_api_token.worker_deployment["api"].name == "cataqui-api-workers-deployment-staging" &&
      cloudflare_api_token.worker_deployment["geosearch"].name == "cataqui-geosearch-workers-deployment-staging" &&
      cloudflare_api_token.worker_deployment["geoimage"].name == "cataqui-geoimage-workers-deployment-staging" &&
      cloudflare_api_token.worker_deployment["maps"].name == "cataqui-maps-workers-deployment-staging" &&
      cloudflare_api_token.worker_deployment["webhooks"].name == "cataqui-webhooks-workers-deployment-staging"
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
    condition     = length(cloudflare_api_token.infrastructure) == 5
    error_message = "Production must create one token for each Cloudflare root."
  }

  assert {
    condition = (
      length(infisical_secret.infrastructure_cloudflare_api_token) +
      length(infisical_secret.ai_gateway_api_token) +
      length(infisical_secret.worker_deployment_cloudflare_api_token)
    ) == 11
    error_message = "Production must deliver five infrastructure, one API runtime, and four application deployment tokens."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-zone-dns"].name == "cataqui-opentofu-cloudflare-zone-dns-production" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-configuration"].name == "cataqui-opentofu-cloudflare-zone-configuration-production" &&
      cloudflare_api_token.ai_gateway_runtime["api"].name == "cataqui-api-ai-gateway-production" &&
      cloudflare_api_token.worker_deployment["api"].name == "cataqui-api-workers-deployment-production" &&
      cloudflare_api_token.worker_deployment["geosearch"].name == "cataqui-geosearch-workers-deployment-production" &&
      cloudflare_api_token.worker_deployment["geoimage"].name == "cataqui-geoimage-workers-deployment-production" &&
      cloudflare_api_token.worker_deployment["maps"].name == "cataqui-maps-workers-deployment-production" &&
      cloudflare_api_token.worker_deployment["webhooks"].name == "cataqui-webhooks-workers-deployment-production"
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
      tolist(local.worker_deployment_tokens.geosearch.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      tolist(local.worker_deployment_tokens.maps.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      tolist(local.worker_deployment_tokens.geoimage.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      tolist(local.worker_deployment_tokens.webhooks.account_permissions) == tolist([
        "workers_scripts_read",
        "workers_scripts_write",
        "account_settings_read",
      ]) &&
      alltrue([
        for token in values(local.worker_deployment_tokens) :
        tolist(token.zone_permissions) == tolist(["zone_read", "workers_routes_read", "workers_routes_write"])
      ])
    )
    error_message = "Application deployment tokens must contain only their approved account and zone permissions."
  }

  assert {
    condition = tolist(local.infrastructure_tokens["cloudflare-zone-configuration"].permissions) == tolist([
      "zone_read",
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
      for token in values(cloudflare_api_token.worker_deployment) :
      jsondecode(token.policies[0].resources) == {
        "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
        } && jsondecode(token.policies[1].resources) == {
        "com.cloudflare.api.account.zone.0c75bfd5c20cdbb338d44e62bcde8acc" = "*"
      }
    ])
    error_message = "Every application deployment token must be scoped to the exact account and cataqui.com zone."
  }

  assert {
    condition = alltrue(concat(
      [for token in values(cloudflare_api_token.infrastructure) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [for token in values(cloudflare_api_token.ai_gateway_runtime) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [for token in values(cloudflare_api_token.worker_deployment) : token.status == "active" && token.expires_on == null && token.not_before == null],
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
      for service, secret in infisical_secret.worker_deployment_cloudflare_api_token :
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
