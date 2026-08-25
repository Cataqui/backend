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
      "cloudflare-ai-gateways/apply",
      "cloudflare-ai-gateways/plan",
      "cloudflare-queues/apply",
      "cloudflare-queues/plan",
    ])
    error_message = "Staging must create only the AI Gateway and Queues plan/apply tokens."
  }

  assert {
    condition     = length(infisical_secret.infrastructure_cloudflare_api_token) + 1 == 5
    error_message = "Staging must deliver four infrastructure tokens and one runtime token."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-ai-gateways/plan"].name == "cataqui-opentofu-cloudflare-ai-gateways-staging-plan" &&
      cloudflare_api_token.infrastructure["cloudflare-ai-gateways/apply"].name == "cataqui-opentofu-cloudflare-ai-gateways-staging-apply" &&
      cloudflare_api_token.infrastructure["cloudflare-queues/plan"].name == "cataqui-opentofu-cloudflare-queues-staging-plan" &&
      cloudflare_api_token.infrastructure["cloudflare-queues/apply"].name == "cataqui-opentofu-cloudflare-queues-staging-apply"
    )
    error_message = "Staging infrastructure tokens must use deterministic root and access names."
  }

  assert {
    condition     = cloudflare_api_token.derive_job_data_ai_gateway_runtime.name == "cataqui-derive-job-data-ai-gateway-staging"
    error_message = "The staging AI Gateway runtime token must use the approved name."
  }
}

run "production_token_inventory" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = length(cloudflare_api_token.infrastructure) == 8
    error_message = "Production must create plan/apply tokens for all four Cloudflare roots."
  }

  assert {
    condition     = length(infisical_secret.infrastructure_cloudflare_api_token) + 1 == 9
    error_message = "Production must deliver eight infrastructure tokens and one runtime token."
  }

  assert {
    condition = (
      cloudflare_api_token.infrastructure["cloudflare-zone-dns/plan"].name == "cataqui-opentofu-cloudflare-zone-dns-production-plan" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-dns/apply"].name == "cataqui-opentofu-cloudflare-zone-dns-production-apply" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-configuration/plan"].name == "cataqui-opentofu-cloudflare-zone-configuration-production-plan" &&
      cloudflare_api_token.infrastructure["cloudflare-zone-configuration/apply"].name == "cataqui-opentofu-cloudflare-zone-configuration-production-apply" &&
      cloudflare_api_token.derive_job_data_ai_gateway_runtime.name == "cataqui-derive-job-data-ai-gateway-production"
    )
    error_message = "Production zone and runtime tokens must use deterministic names."
  }
}

run "least_privilege_permissions" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      tolist(local.infrastructure_tokens["cloudflare-ai-gateways/plan"].permissions) == tolist(["ai_gateway_read"]) &&
      tolist(local.infrastructure_tokens["cloudflare-ai-gateways/apply"].permissions) == tolist(["ai_gateway_write"]) &&
      tolist(local.infrastructure_tokens["cloudflare-queues/plan"].permissions) == tolist(["queues_read"]) &&
      tolist(local.infrastructure_tokens["cloudflare-queues/apply"].permissions) == tolist(["queues_write"]) &&
      tolist(local.infrastructure_tokens["cloudflare-zone-dns/plan"].permissions) == tolist(["zone_read", "dns_read"]) &&
      tolist(local.infrastructure_tokens["cloudflare-zone-dns/apply"].permissions) == tolist(["zone_read", "dns_write"])
    )
    error_message = "AI Gateway, Queues, and DNS tokens must retain their exact least-privilege permission sets."
  }

  assert {
    condition = tolist(local.infrastructure_tokens["cloudflare-zone-configuration/plan"].permissions) == tolist([
      "zone_read",
      "zone_settings_read",
      "zone_waf_read",
      "bot_management_read",
      "response_compression_read",
      "ssl_certificates_read",
      ]) && tolist(local.infrastructure_tokens["cloudflare-zone-configuration/apply"].permissions) == tolist([
      "zone_read",
      "zone_settings_write",
      "zone_waf_write",
      "bot_management_write",
      "response_compression_write",
      "ssl_certificates_write",
    ])
    error_message = "Zone configuration tokens must include only the permissions required by the managed resources."
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
    condition = jsondecode(cloudflare_api_token.infrastructure["cloudflare-ai-gateways/plan"].policies[0].resources) == {
      "com.cloudflare.api.account.1fca946385505503c59dd6a2a4eeb442" = "*"
      } && jsondecode(cloudflare_api_token.infrastructure["cloudflare-zone-dns/plan"].policies[0].resources) == {
      "com.cloudflare.api.account.zone.0c75bfd5c20cdbb338d44e62bcde8acc" = "*"
    }
    error_message = "Account tokens and zone tokens must use their exact Cloudflare resource scopes."
  }

  assert {
    condition = alltrue(concat(
      [for token in values(cloudflare_api_token.infrastructure) : token.status == "active" && token.expires_on == null && token.not_before == null],
      [cloudflare_api_token.derive_job_data_ai_gateway_runtime.status == "active" && cloudflare_api_token.derive_job_data_ai_gateway_runtime.expires_on == null && cloudflare_api_token.derive_job_data_ai_gateway_runtime.not_before == null],
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
      secret.folder_path == "/generated/opentofu/${local.infrastructure_tokens[token_key].root}/${local.infrastructure_tokens[token_key].access}" &&
      secret.name == "CLOUDFLARE_API_TOKEN" &&
      secret.value_wo_version == 1
    ])
    error_message = "Every infrastructure token must be delivered to its exact generated plan/apply folder."
  }

  assert {
    condition = (
      infisical_secret.derive_job_data_ai_gateway_api_token.folder_path == "/generated/api/runtime" &&
      infisical_secret.derive_job_data_ai_gateway_api_token.name == "DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN" &&
      infisical_secret.derive_job_data_ai_gateway_api_token.value_wo_version == 1
    )
    error_message = "The AI Gateway runtime token must remain in the API runtime contract."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
