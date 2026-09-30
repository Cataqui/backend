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
