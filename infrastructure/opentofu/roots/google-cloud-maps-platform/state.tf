data "terraform_remote_state" "google_cloud_projects" {
  backend = "s3"

  config = {
    bucket = local.opentofu_state_bucket
    key    = "${var.environment}/google-cloud-projects/terraform.tfstate"
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
