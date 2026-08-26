provider "google" {
  project               = local.google_cloud_project_id
  billing_project       = local.google_cloud_project_id
  user_project_override = true
}

provider "infisical" {}
