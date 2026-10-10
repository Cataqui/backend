resource "cloudflare_r2_bucket" "maps" {
  account_id    = local.cloudflare_account_id
  name          = local.maps_bucket_name
  jurisdiction  = "default"
  location      = "enam"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_managed_domain" "maps" {
  account_id   = local.cloudflare_account_id
  bucket_name  = cloudflare_r2_bucket.maps.name
  jurisdiction = "default"
  enabled      = false
}

resource "cloudflare_r2_bucket_lifecycle" "maps" {
  account_id   = local.cloudflare_account_id
  bucket_name  = cloudflare_r2_bucket.maps.name
  jurisdiction = "default"
  rules = [{
    id      = "abort_incomplete_multipart_uploads_after_seven_days"
    enabled = true
    conditions = {
      prefix = ""
    }
    abort_multipart_uploads_transition = {
      condition = {
        type    = "Age"
        max_age = 604800
      }
    }
  }]
}
