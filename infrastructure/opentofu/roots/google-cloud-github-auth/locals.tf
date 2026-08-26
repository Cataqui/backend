locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  github_repository             = local.platforms.github.repository
  google_cloud_billing_account  = local.platforms.google_cloud.billing_account_id
  workload_identity_pool_id     = local.manifest.google_cloud.github_auth.workload_identity_pool_id
  workload_identity_provider_id = local.manifest.google_cloud.github_auth.workload_identity_provider_id

  environments = {
    staging = {
      project_id         = local.manifest.google_cloud.projects.cataqui_staging.id
      service_account_id = local.manifest.google_cloud.github_auth.service_accounts.cataqui_backend_staging
      github_subject     = "${var.github_oidc_subject_prefix}:environment:staging"
    }
    production = {
      project_id         = local.manifest.google_cloud.projects.cataqui_production.id
      service_account_id = local.manifest.google_cloud.github_auth.service_accounts.cataqui_backend_production
      github_subject     = "${var.github_oidc_subject_prefix}:environment:production"
    }
  }

  project_roles = toset([
    "roles/resourcemanager.projectMover",
    "roles/billing.projectManager",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/serviceusage.apiKeysAdmin",
  ])

  environment_project_roles = {
    for pair in setproduct(keys(local.environments), local.project_roles) :
    "${pair[0]}:${pair[1]}" => {
      environment = pair[0]
      role        = pair[1]
    }
  }

  identity_services = merge(
    {
      for pair in setproduct(keys(local.environments), [
        "cloudresourcemanager.googleapis.com",
        "iam.googleapis.com",
        "serviceusage.googleapis.com",
      ]) :
      "${pair[0]}:${pair[1]}" => {
        environment = pair[0]
        service     = pair[1]
      }
    },
    {
      for service in ["iamcredentials.googleapis.com", "sts.googleapis.com"] :
      "production:${service}" => {
        environment = "production"
        service     = service
      }
    },
  )
}
