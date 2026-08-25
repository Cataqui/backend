locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)

  derive_job_data_gateway_by_environment = {
    staging = {
      id          = "cataqui-derive-job-data-staging"
      spend_limit = 5
    }
    production = {
      id          = "cataqui-derive-job-data-production"
      spend_limit = 50
    }
  }

  derive_job_data_gateway = local.derive_job_data_gateway_by_environment[var.environment]
}
