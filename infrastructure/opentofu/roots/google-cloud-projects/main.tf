resource "random_id" "project_suffix" {
  byte_length = 3
}

resource "google_project" "cataqui" {
  name                = local.project.name
  project_id          = "${local.project.id_prefix}-${random_id.project_suffix.hex}"
  org_id              = local.google_cloud_organization_id
  billing_account     = local.google_cloud_billing_account
  auto_create_network = false
  deletion_policy     = "PREVENT"

  labels = {
    environment = var.environment
    managed-by  = "opentofu"
    product     = "cataqui"
  }

  lifecycle {
    prevent_destroy = true
  }
}
