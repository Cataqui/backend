mock_provider "cloudflare" {}

run "staging_primary_queue_name_matches_the_worker_binding" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = output.queue_names["derive_job_data"].primary == "cataqui-api-derive-job-data-staging"
    error_message = "The staging primary Queue name must match the Queue configured in the API Worker's wrangler.jsonc."
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
    error_message = "The staging dead-letter Queue name must match the Queue configured in the API Worker's wrangler.jsonc."
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
    error_message = "The production primary Queue name must match the Queue configured in the API Worker's wrangler.jsonc."
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
    error_message = "The production dead-letter Queue name must match the Queue configured in the API Worker's wrangler.jsonc."
  }
}

run "verify_whatsapp_auth_message_queue_names_match_the_staging_worker_bindings" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition = output.queue_names["verify_whatsapp_auth_message"] == {
      primary     = "cataqui-api-verify-whatsapp-auth-message-staging"
      dead_letter = "cataqui-api-verify-whatsapp-auth-message-staging-dlq"
    }
    error_message = "The WhatsApp auth Queue names must match the staging bindings in both Worker configurations."
  }
}

run "verify_whatsapp_auth_message_queue_names_match_the_production_worker_bindings" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "production"
  }

  assert {
    condition = output.queue_names["verify_whatsapp_auth_message"] == {
      primary     = "cataqui-api-verify-whatsapp-auth-message-production"
      dead_letter = "cataqui-api-verify-whatsapp-auth-message-production-dlq"
    }
    error_message = "The WhatsApp auth Queue names must match the production bindings in both Worker configurations."
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

run "verify_whatsapp_auth_message_primary_queue_retention_matches_the_pending_intent_window" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = module.queue_pair["verify_whatsapp_auth_message"].primary_message_retention_seconds == 900
    error_message = "The WhatsApp auth primary Queue must retain messages for 15 minutes."
  }
}

run "verify_whatsapp_auth_message_dead_letter_queue_retains_failures_for_twenty_four_hours" {
  command = plan

  variables {
    cloudflare_account_id = "00000000000000000000000000000000"
    environment           = "staging"
  }

  assert {
    condition     = module.queue_pair["verify_whatsapp_auth_message"].dead_letter_message_retention_seconds == 86400
    error_message = "The WhatsApp auth dead-letter Queue must retain failed messages for twenty-four hours."
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
