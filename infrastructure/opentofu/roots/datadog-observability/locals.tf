locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  environment_settings = {
    staging = {
      api_host = "staging.api.cataqui.com"
      # Staging sleeps when idle, so it is checked rarely to keep synthetic runs cheap.
      health_check_interval_seconds = 1800
    }
    production = {
      api_host                      = "api.cataqui.com"
      health_check_interval_seconds = 300
    }
  }
  settings = local.environment_settings[var.environment]

  service = "cataqui-api"
  # Every query and monitor is limited to the API of this environment.
  scope        = "service:${local.service} env:${var.environment}"
  metric_scope = "service:${local.service},env:${var.environment}"
  tags         = ["service:${local.service}", "env:${var.environment}", "managed-by:opentofu"]

  # Datadog handles (for example "@slack-backend-alerts" or "@someone@cataqui.com") that every monitor notifies.
  # Empty until the team picks a destination; monitors still show their state in Datadog.
  notification_handles = []
  notify               = join(" ", local.notification_handles)
}
