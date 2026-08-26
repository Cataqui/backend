locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)

  derive_job_data_gateway_by_environment = {
    staging = {
      id          = local.manifest.cloudflare.ai_gateways.derive_job_data_staging
      spend_limit = 5
    }
    production = {
      id          = local.manifest.cloudflare.ai_gateways.derive_job_data_production
      spend_limit = 50
    }
  }

  derive_job_data_gateway = local.derive_job_data_gateway_by_environment[var.environment]
}
