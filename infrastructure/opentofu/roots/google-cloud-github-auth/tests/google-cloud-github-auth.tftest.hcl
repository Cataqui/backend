mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      name  = "projects/cataqui-production-jd7bfto/serviceAccounts/cataqui-backend-opentofu-prod@cataqui-production-jd7bfto.iam.gserviceaccount.com"
      email = "cataqui-backend-opentofu-prod@cataqui-production-jd7bfto.iam.gserviceaccount.com"
    }
  }

  mock_resource "google_iam_workload_identity_pool" {
    defaults = {
      name = "projects/123456789012/locations/global/workloadIdentityPools/cataqui-github"
    }
  }

  mock_resource "google_iam_workload_identity_pool_provider" {
    defaults = {
      name = "projects/123456789012/locations/global/workloadIdentityPools/cataqui-github/providers/cataqui-backend"
    }
  }
}

run "github_trust" {
  command = plan

  assert {
    condition = (
      google_iam_workload_identity_pool.github.project == "cataqui-production-jd7bfto" &&
      google_iam_workload_identity_pool.github.workload_identity_pool_id == "cataqui-github" &&
      google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id == "cataqui-backend" &&
      google_iam_workload_identity_pool_provider.github.oidc[0].issuer_uri == "https://token.actions.githubusercontent.com" &&
      google_iam_workload_identity_pool_provider.github.oidc[0].allowed_audiences[0] == "https://github.com/Cataqui"
    )
    error_message = "GitHub trust must use the stable production-hosted pool and GitHub issuer."
  }
}

run "environment_service_accounts" {
  command = plan

  assert {
    condition = (
      google_service_account.opentofu["staging"].project == "cataqui-staging-mre5wge" &&
      google_service_account.opentofu["staging"].account_id == "cataqui-backend-opentofu-stg" &&
      google_service_account.opentofu["production"].project == "cataqui-production-jd7bfto" &&
      google_service_account.opentofu["production"].account_id == "cataqui-backend-opentofu-prod"
    )
    error_message = "Each environment must own a distinct keyless OpenTofu service account."
  }
}

run "least_privilege_roles" {
  command = plan

  assert {
    condition = (
      length(google_project_iam_member.opentofu) == 8 &&
      length(google_billing_account_iam_member.opentofu) == 2 &&
      alltrue([for binding in values(google_service_account_iam_member.github) : binding.role == "roles/iam.workloadIdentityUser"])
    )
    error_message = "OpenTofu identities must receive only the approved project, billing, and workload identity roles."
  }
}
