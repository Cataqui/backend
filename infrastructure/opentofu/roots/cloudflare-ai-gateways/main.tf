data "cloudflare_api_token_permission_groups_list" "ai_gateway_run" {
  name  = "AI%20Gateway%20Run"
  scope = "com.cloudflare.api.account"
}

resource "cloudflare_ai_gateway" "derive_job_data" {
  account_id                 = local.cloudflare_account_id
  id                         = local.derive_job_data_gateway.id
  authentication             = true
  cache_invalidate_on_update = true
  cache_ttl                  = 0
  collect_logs               = false
  logpush                    = false
  rate_limiting_interval     = 0
  rate_limiting_limit        = 0
  rate_limiting_technique    = "fixed"
  retry_backoff              = "constant"
  retry_delay                = 0
  retry_max_attempts         = 1
  workers_ai_billing_mode    = "postpaid"
  zdr                        = false

  spend_limits = {
    enabled = true
    rules = [{
      enabled    = true
      limit      = local.derive_job_data_gateway.spend_limit
      limit_type = "cost"
      technique  = "sliding"
      window     = 2592000
    }]
  }
}

resource "cloudflare_api_token" "derive_job_data_runtime" {
  name   = "${local.derive_job_data_gateway.id}-runtime"
  status = "active"

  policies = [{
    effect = "allow"
    permission_groups = [{
      id = one(data.cloudflare_api_token_permission_groups_list.ai_gateway_run.result).id
    }]
    resources = jsonencode({
      "com.cloudflare.api.account.${local.cloudflare_account_id}" = "*"
    })
  }]

  lifecycle {
    precondition {
      condition     = length(data.cloudflare_api_token_permission_groups_list.ai_gateway_run.result) == 1
      error_message = "Cloudflare must return exactly one account-scoped AI Gateway Run permission group."
    }
  }
}

resource "infisical_secret" "derive_job_data_ai_gateway_api_token" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/runtime"
  name             = "DERIVE_JOB_DATA_AI_GATEWAY_API_TOKEN"
  value_wo         = cloudflare_api_token.derive_job_data_runtime.value
  value_wo_version = 1
}
