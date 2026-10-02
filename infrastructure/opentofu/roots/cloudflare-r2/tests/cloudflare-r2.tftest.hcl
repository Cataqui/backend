mock_provider "cloudflare" {}

run "staging_private_image_storage" {
  command = plan
  variables {
    environment = "staging"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.geoimage_images.name == "cataqui-geoimage-staging" &&
      cloudflare_r2_bucket.geoimage_images.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.geoimage_images.storage_class == "Standard" &&
      cloudflare_r2_bucket.geoimage_images.location == "enam" &&
      cloudflare_r2_bucket.geoimage_images.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.geoimage_images.enabled &&
      cloudflare_r2_managed_domain.geoimage_images.bucket_name == cloudflare_r2_bucket.geoimage_images.name &&
      cloudflare_r2_managed_domain.geoimage_images.jurisdiction == "default"
    )
    error_message = "Image storage must use the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.geoimage_images.bucket_name == cloudflare_r2_bucket.geoimage_images.name &&
      length(cloudflare_r2_bucket_lifecycle.geoimage_images.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed images must remain."
  }
}

run "production_private_image_storage" {
  command = plan
  variables {
    environment = "production"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.geoimage_images.name == "cataqui-geoimage-production" &&
      cloudflare_r2_bucket.geoimage_images.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.geoimage_images.storage_class == "Standard" &&
      cloudflare_r2_bucket.geoimage_images.location == "enam" &&
      cloudflare_r2_bucket.geoimage_images.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.geoimage_images.enabled &&
      cloudflare_r2_managed_domain.geoimage_images.bucket_name == cloudflare_r2_bucket.geoimage_images.name &&
      cloudflare_r2_managed_domain.geoimage_images.jurisdiction == "default"
    )
    error_message = "Image storage must use the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.geoimage_images.bucket_name == cloudflare_r2_bucket.geoimage_images.name &&
      length(cloudflare_r2_bucket_lifecycle.geoimage_images.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.geoimage_images.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed images must remain."
  }
}

run "rejects_unsupported_environment" {
  command = plan
  variables {
    environment = "development"
  }
  expect_failures = [var.environment]
}

run "staging_private_maps_storage" {
  command = plan
  variables {
    environment = "staging"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.maps.name == "cataqui-maps-staging" &&
      cloudflare_r2_bucket.maps.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.maps.storage_class == "Standard" &&
      cloudflare_r2_bucket.maps.location == "enam" &&
      cloudflare_r2_bucket.maps.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.maps.enabled &&
      cloudflare_r2_managed_domain.maps.bucket_name == cloudflare_r2_bucket.maps.name &&
      cloudflare_r2_managed_domain.maps.jurisdiction == "default"
    )
    error_message = "Image storage must use the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.maps.bucket_name == cloudflare_r2_bucket.maps.name &&
      length(cloudflare_r2_bucket_lifecycle.maps.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed images must remain."
  }
}

run "production_private_maps_storage" {
  command = plan
  variables {
    environment = "production"
  }
  assert {
    condition = (
      cloudflare_r2_bucket.maps.name == "cataqui-maps-production" &&
      cloudflare_r2_bucket.maps.account_id == "1fca946385505503c59dd6a2a4eeb442" &&
      cloudflare_r2_bucket.maps.storage_class == "Standard" &&
      cloudflare_r2_bucket.maps.location == "enam" &&
      cloudflare_r2_bucket.maps.jurisdiction == "default" &&
      !cloudflare_r2_managed_domain.maps.enabled &&
      cloudflare_r2_managed_domain.maps.bucket_name == cloudflare_r2_bucket.maps.name &&
      cloudflare_r2_managed_domain.maps.jurisdiction == "default"
    )
    error_message = "Image storage must use the isolated private Standard bucket with the agreed placement."
  }
  assert {
    condition = (
      cloudflare_r2_bucket_lifecycle.maps.bucket_name == cloudflare_r2_bucket.maps.name &&
      length(cloudflare_r2_bucket_lifecycle.maps.rules) == 1 &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].enabled &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].conditions.prefix == "" &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].abort_multipart_uploads_transition.condition.type == "Age" &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].abort_multipart_uploads_transition.condition.max_age == 604800 &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].delete_objects_transition == null &&
      cloudflare_r2_bucket_lifecycle.maps.rules[0].storage_class_transitions == null
    )
    error_message = "Only incomplete multipart uploads may expire, after seven days; completed images must remain."
  }
}
