resource "neon_project" "cataqui" {
  name                       = local.project.name
  org_id                     = local.neon_organization_id
  region_id                  = "aws-sa-east-1"
  pg_version                 = 18
  history_retention_seconds  = local.project.history_retention_seconds
  default_branch_protected   = true
  enable_logical_replication = "no"
  store_password             = "yes"

  branch {
    name          = "main"
    database_name = local.database_name
    role_name     = local.database_owner_role_name
  }

  default_endpoint_settings {
    autoscaling_limit_min_cu = local.project.autoscaling_limit_min_cu
    autoscaling_limit_max_cu = local.project.autoscaling_limit_max_cu
    suspend_timeout_seconds  = 300
  }

  maintenance_window {
    weekdays   = [local.project.maintenance_weekday]
    start_time = "06:00"
    end_time   = "07:00"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "infisical_secret" "database_owner_direct_url" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/deployment"
  name             = "DATABASE_OWNER_DIRECT_URL"
  value_wo         = neon_project.cataqui.connection_uri
  value_wo_version = 1
}

resource "infisical_secret" "database_owner_host" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/deployment"
  name             = "DATABASE_OWNER_HOST"
  value_wo         = neon_project.cataqui.database_host
  value_wo_version = 1
}

resource "infisical_secret" "database_owner_password" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/deployment"
  name             = "DATABASE_OWNER_PASSWORD"
  value_wo         = neon_project.cataqui.database_password
  value_wo_version = 1
}

resource "infisical_secret" "database_pooler_host" {
  workspace_id     = local.infisical_project_id
  env_slug         = var.environment
  folder_path      = "/generated/api/deployment"
  name             = "DATABASE_POOLER_HOST"
  value_wo         = neon_project.cataqui.database_host_pooler
  value_wo_version = 1
}
