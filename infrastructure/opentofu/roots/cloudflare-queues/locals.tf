locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)

  derive_job_data_queue_by_environment = {
    staging    = local.manifest.cloudflare.queues.derive_job_data_staging
    production = local.manifest.cloudflare.queues.derive_job_data_production
  }

  queue_families = {
    derive_job_data = {
      name                         = local.derive_job_data_queue_by_environment[var.environment].name
      dead_letter_name             = local.derive_job_data_queue_by_environment[var.environment].dead_letter_name
      primary_retention_period     = 345600
      dead_letter_retention_period = 1209600
    }
  }
}
