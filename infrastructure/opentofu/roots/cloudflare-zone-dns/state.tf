locals {
  manifest = jsondecode(file("${path.module}/../../../manifest.json"))
}

data "terraform_remote_state" "pages_staging" {
  backend = "s3"

  config = {
    bucket = local.manifest.cloudflare.r2.buckets.opentofu_state
    key    = "staging/cloudflare-pages/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://${local.cloudflare_account_id}.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

data "terraform_remote_state" "pages_production" {
  backend = "s3"

  config = {
    bucket = local.manifest.cloudflare.r2.buckets.opentofu_state
    key    = "production/cloudflare-pages/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://${local.cloudflare_account_id}.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
