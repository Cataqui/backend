resource "neon_project" "database" {
  name       = local.database_configuration.project_name
  org_id     = var.neon_organization_id
  region_id  = "aws-sa-east-1"
  pg_version = 18

  branch {
    name          = local.database_configuration.branch_name
    database_name = local.database_configuration.database_name
    role_name     = local.database_configuration.owner_role_name
  }

  default_endpoint_settings {
    autoscaling_limit_min_cu = 0.25
    autoscaling_limit_max_cu = 2

    # Paid Scale plan: configure the suspend timeout after upgrading.
    # suspend_timeout_seconds = 300
  }

  history_retention_seconds  = 21600
  enable_logical_replication = "no"
  store_password             = "yes"

  lifecycle {
    prevent_destroy = true
  }
}

resource "random_password" "app" {
  length           = 32
  special          = true
  override_special = "!#$%&*+-.:<=>?@^_~"
}
