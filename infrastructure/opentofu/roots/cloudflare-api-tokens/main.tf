data "cloudflare_api_token_permission_groups_list" "required" {
  for_each = local.permission_groups

  name      = each.value.name
  scope     = each.value.scope
  max_items = 2
}

resource "cloudflare_api_token" "infrastructure" {
  for_each = local.infrastructure_tokens

  name   = "cataqui-opentofu-${each.key}-${var.environment}"
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

resource "cloudflare_api_token" "ai_gateway_runtime" {
  for_each = local.ai_gateway_runtime_tokens

  name   = "cataqui-${each.key}-ai-gateway-${var.environment}"
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
  folder_path      = "/generated/opentofu/${each.key}"
  name             = "CLOUDFLARE_API_TOKEN"
  value_wo         = cloudflare_api_token.infrastructure[each.key].value
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "ai_gateway_api_token" {
  for_each = local.ai_gateway_runtime_tokens

  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = each.value.folder_path
  name             = each.value.secret_name
  value_wo         = cloudflare_api_token.ai_gateway_runtime[each.key].value
  value_wo_version = 1

  lifecycle {
    prevent_destroy = true
  }
}
