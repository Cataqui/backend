mock_provider "cloudflare" {}

run "staging_queue_pair" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      cloudflare_queue.primary["derive_job_data"].queue_name == "cataqui-api-derive-job-data-staging" &&
      cloudflare_queue.primary["derive_job_data"].settings.message_retention_period == 345600 &&
      cloudflare_queue.dead_letter["derive_job_data"].queue_name == "cataqui-api-derive-job-data-staging-dlq" &&
      cloudflare_queue.dead_letter["derive_job_data"].settings.message_retention_period == 1209600
    )
    error_message = "Staging must have the derive-job-data primary queue and DLQ with their intended retention periods."
  }
}

run "production_queue_pair" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      cloudflare_queue.primary["derive_job_data"].queue_name == "cataqui-api-derive-job-data-production" &&
      cloudflare_queue.primary["derive_job_data"].settings.message_retention_period == 345600 &&
      cloudflare_queue.dead_letter["derive_job_data"].queue_name == "cataqui-api-derive-job-data-production-dlq" &&
      cloudflare_queue.dead_letter["derive_job_data"].settings.message_retention_period == 1209600
    )
    error_message = "Production must have the derive-job-data primary queue and DLQ with their intended retention periods."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
