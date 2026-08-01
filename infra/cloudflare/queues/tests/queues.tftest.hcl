mock_provider "cloudflare" {}

run "staging_primary_queue_name_matches_the_worker_binding" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = output.queue_names["derive_job_data"].primary == "cataqui-api-derive-job-data-staging"
    error_message = "The staging primary Queue name must match the Queue configured in wrangler.jsonc."
  }
}

run "staging_dead_letter_queue_name_matches_the_worker_binding" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = output.queue_names["derive_job_data"].dead_letter == "cataqui-api-derive-job-data-staging-dlq"
    error_message = "The staging dead-letter Queue name must match the Queue configured in wrangler.jsonc."
  }
}

run "production_primary_queue_name_matches_the_worker_binding" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "production"
  }

  assert {
    condition     = output.queue_names["derive_job_data"].primary == "cataqui-api-derive-job-data-production"
    error_message = "The production primary Queue name must match the Queue configured in wrangler.jsonc."
  }
}

run "production_dead_letter_queue_name_matches_the_worker_binding" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "production"
  }

  assert {
    condition     = output.queue_names["derive_job_data"].dead_letter == "cataqui-api-derive-job-data-production-dlq"
    error_message = "The production dead-letter Queue name must match the Queue configured in wrangler.jsonc."
  }
}

run "primary_queue_retains_unprocessed_messages_for_four_days" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = module.queue_pair["derive_job_data"].primary_message_retention_seconds == 345600
    error_message = "The primary Queue must retain unprocessed messages for four days so temporary consumer outages can recover."
  }
}

run "dead_letter_queue_retains_failed_messages_for_fourteen_days" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = module.queue_pair["derive_job_data"].dead_letter_message_retention_seconds == 1209600
    error_message = "The dead-letter Queue must retain failed messages for fourteen days so operators have time to investigate and replay them."
  }
}

run "unsupported_environments_are_rejected_before_infrastructure_is_planned" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "development"
  }

  expect_failures = [var.environment]
}
