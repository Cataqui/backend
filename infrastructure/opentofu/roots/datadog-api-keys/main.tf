# The API sends traces, logs, and metrics with this key. It only ingests data and cannot read or change the
# Datadog account, so it is kept separate from the bootstrap credentials OpenTofu authenticates with.
resource "datadog_api_key" "api_runtime" {
  name = local.manifest.datadog.api_keys["cataqui_api_${var.environment}"].name
}

resource "infisical_secret" "datadog_api_key" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/runtime"
  name             = "DATADOG_API_KEY"
  value_wo         = datadog_api_key.api_runtime.key
  value_wo_version = 1
}

data "datadog_service_account" "opentofu" {
  filter      = local.manifest.datadog.opentofu.service_account.email
  exact_match = true

  lifecycle {
    postcondition {
      condition     = self.email == local.manifest.datadog.opentofu.service_account.email && !self.disabled
      error_message = "The bootstrap must create the enabled OpenTofu service account before its root keys can be issued."
    }
  }
}

resource "datadog_api_key" "opentofu_root" {
  for_each = local.opentofu_roots

  name = "cataqui-opentofu-${each.key}-${var.environment}"
}

resource "datadog_service_account_application_key" "opentofu_root" {
  for_each = local.opentofu_roots

  service_account_id = data.datadog_service_account.opentofu.id
  name               = "cataqui-opentofu-${each.key}-${var.environment}"
  scopes             = each.value.scopes
}

resource "infisical_secret" "opentofu_root_api_key" {
  for_each = local.opentofu_roots

  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/opentofu/${each.key}"
  name             = "DD_API_KEY"
  value_wo         = datadog_api_key.opentofu_root[each.key].key
  value_wo_version = 1
}

resource "infisical_secret" "opentofu_root_application_key" {
  for_each = local.opentofu_roots

  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/opentofu/${each.key}"
  name             = "DD_APP_KEY"
  value_wo         = datadog_service_account_application_key.opentofu_root[each.key].key
  value_wo_version = 1
}
