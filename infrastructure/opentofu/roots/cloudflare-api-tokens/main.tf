data "cloudflare_api_token_permission_groups_list" "required" {
  for_each = local.permission_groups

  name      = each.value.name
  scope     = each.value.scope
  max_items = 2
}

resource "cloudflare_api_token" "infrastructure" {
  for_each = local.infrastructure_tokens

  name   = "cataqui-opentofu-${each.value.root}-${var.environment}-${each.value.access}"
  status = "active"

  policies = [{
    effect = "allow"
    permission_groups = [
      for permission in each.value.permissions : {
        id = one(data.cloudflare_api_token_permission_groups_list.required[permission].result).id
      }
    ]
    resources = jsonencode({
      (each.value.scope == "account" ?
        "com.cloudflare.api.account.${local.cloudflare_account_id}" :
        "com.cloudflare.api.account.zone.${local.cataqui_zone_id}"
      ) = "*"
    })
  }]

  lifecycle {
    prevent_destroy = true

    precondition {
      condition = alltrue([
        for permission in each.value.permissions :
        length(data.cloudflare_api_token_permission_groups_list.required[permission].result) == 1
      ])
      error_message = "Cloudflare must return exactly one permission group for every infrastructure-token permission."
    }
  }
}

resource "cloudflare_api_token" "derive_job_data_ai_gateway_runtime" {
  name   = "cataqui-derive-job-data-ai-gateway-${var.environment}"
  status = "active"

  policies = [{
    effect = "allow"
    permission_groups = [{
      id = one(data.cloudflare_api_token_permission_groups_list.required["ai_gateway_run"].result).id
    }]
    resources = jsonencode({
      "com.cloudflare.api.account.${local.cloudflare_account_id}" = "*"
    })
  }]

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = length(data.cloudflare_api_token_permission_groups_list.required["ai_gateway_run"].result) == 1
      error_message = "Cloudflare must return exactly one account-scoped AI Gateway Run permission group."
    }
  }
}

resource "infisical_secret" "infrastructure_cloudflare_api_token" {
  for_each = local.infrastructure_tokens

  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/opentofu/${each.value.root}/${each.value.access}"
  name             = "CLOUDFLARE_API_TOKEN"
  value_wo         = cloudflare_api_token.infrastructure[each.key].value
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "derive_job_data_ai_gateway_api_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"
  value_wo         = cloudflare_api_token.derive_job_data_ai_gateway_runtime.value
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}
