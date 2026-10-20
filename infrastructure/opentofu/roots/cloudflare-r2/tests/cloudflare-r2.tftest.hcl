mock_provider "cloudflare" {}

run "rejects_unsupported_environment" {
  command = plan
  variables {
    environment = "development"
  }
  expect_failures = [var.environment]
}

run "staging_private_mapshot_storage" {
  command = plan
  variables {
    environment = "staging"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.mapshot.name == "cataqui-mapshot-staging" &&
      cloudflare_r2_bucket.mapshot.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.mapshot.storage_class == "Standard" &&
      cloudflare_r2_bucket.mapshot.location == "enam" &&
      cloudflare_r2_bucket.mapshot.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.mapshot.enabled &&
      cloudflare_r2_managed_domain.mapshot.bucket_name == cloudflare_r2_bucket.mapshot.name &&
      cloudflare_r2_managed_domain.mapshot.jurisdiction == "default"
    )
    error_message = "Mapshot storage must retain the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.mapshot.bucket_name == cloudflare_r2_bucket.mapshot.name &&
      length(cloudflare_r2_bucket_lifecycle.mapshot.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed source objects must remain."
  }
}

run "production_private_mapshot_storage" {
  command = plan
  variables {
    environment = "production"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.mapshot.name == "cataqui-mapshot-production" &&
      cloudflare_r2_bucket.mapshot.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.mapshot.storage_class == "Standard" &&
      cloudflare_r2_bucket.mapshot.location == "enam" &&
      cloudflare_r2_bucket.mapshot.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.mapshot.enabled &&
      cloudflare_r2_managed_domain.mapshot.bucket_name == cloudflare_r2_bucket.mapshot.name &&
      cloudflare_r2_managed_domain.mapshot.jurisdiction == "default"
    )
    error_message = "Mapshot storage must retain the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.mapshot.bucket_name == cloudflare_r2_bucket.mapshot.name &&
      length(cloudflare_r2_bucket_lifecycle.mapshot.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.mapshot.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed source objects must remain."
  }
}
