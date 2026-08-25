resource "google_project_service" "identity" {
  for_each = local.identity_services

  project            = local.environments[each.value.environment].project_id
  service            = each.value.service
  disable_on_destroy = false
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = local.environments.production.project_id
  workload_identity_pool_id = local.workload_identity_pool_id
  display_name              = "Cataqui GitHub"
  description               = "GitHub Actions identities for protected Cataqui environments."
  disabled                  = false

  depends_on = [google_project_service.identity]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = local.environments.production.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = local.workload_identity_provider_id
  display_name                       = "Cataqui backend GitHub"
  description                        = "Trusts only protected Cataqui/backend deployment environments."
  disabled                           = false

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  attribute_condition = join(" || ", [
    for environment in values(local.environments) : "assertion.sub == '${environment.github_subject}'"
  ])

  oidc {
    issuer_uri        = "https://token.actions.githubusercontent.com"
    allowed_audiences = ["https://github.com/Cataqui"]
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "opentofu" {
  for_each = local.environments

  project      = each.value.project_id
  account_id   = each.value.service_account_id
  display_name = "Cataqui OpenTofu ${title(each.key)}"
  description  = "Keyless OpenTofu execution from the protected ${each.key} GitHub environment."
  disabled     = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account_iam_member" "github" {
  for_each = local.environments

  service_account_id = google_service_account.opentofu[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/${each.value.github_subject}"
}

resource "google_project_iam_member" "opentofu" {
  for_each = local.environment_project_roles

  project = local.environments[each.value.environment].project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.opentofu[each.value.environment].email}"
}

resource "google_billing_account_iam_member" "opentofu" {
  for_each = local.environments

  billing_account_id = local.google_cloud_billing_account
  role               = "roles/billing.user"
  member             = "serviceAccount:${google_service_account.opentofu[each.key].email}"
}
