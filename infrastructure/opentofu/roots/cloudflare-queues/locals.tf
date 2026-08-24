locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)

  queue_families = {
    derive_job_data = {
      base_name                    = "cataqui-api-derive-job-data"
      primary_retention_period     = 345600
      dead_letter_retention_period = 1209600
    }
  }
}
