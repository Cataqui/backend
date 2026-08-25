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

mock_provider "infisical" {}

run "staging_token_inventory" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = toset(keys(cloudflare_api_token.infrastructure)) == toset([
      "cloudflare-ai-gateways",
      "cloudflare-queues",
    ])
    error_message = "Staging must create one infrastructure token for each account-scoped Cloudflare root."
  }

  assert {
    condition     = length(infisical_secret.infrastructure_cloudflare_api_token) + length(infisical_secret.ai_gateway_api_token) == 3
    error_message = "Staging must deliver two infrastructure tokens and one API runtime token."
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
}

run "production_token_inventory" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = length(cloudflare_api_token.infrastructure) == 4
    error_message = "Production must create one token for each Cloudflare root."
  }

  assert {
    condition     = length(infisical_secret.infrastructure_cloudflare_api_token) + length(infisical_secret.ai_gateway_api_token) == 5
    error_message = "Production must deliver four infrastructure tokens and one API runtime token."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-zone-dns"].name == "cataqui-opentofu-cloudflare-zone-dns-production" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-configuration"].name == "cataqui-opentofu-cloudflare-zone-configuration-production" &&
      cloudflare_api_token.ai_gateway_runtime["api"].name == "cataqui-api-ai-gateway-production"
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
      data.cloudflare_api_token_permission_groups_list.required["zone_waf_write"].name == "Zone WAF Write" &&
      data.cloudflare_api_token_permission_groups_list.required["zone_waf_write"].scope == "com.cloudflare.api.account.zone"
    )
    error_message = "Permission groups must be resolved by their plain provider names and exact scopes."
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
    condition = alltrue(concat(
      [for token in values(cloudflare_api_token.infrastructure) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [for token in values(cloudflare_api_token.ai_gateway_runtime) : token.status == "active" && token.expires_on == null && token.not_before == null],
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
      secret.workspace_id == "954d434f-7e08-4904-af66-0bf62377794e" &&
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
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
