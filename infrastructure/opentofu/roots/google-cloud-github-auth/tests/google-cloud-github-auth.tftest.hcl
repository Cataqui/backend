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

variables {
  github_oidc_subject_prefix = "repo:Cataqui@288484515/backend@1252587238"
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

  assert {
    condition = (
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "repo:Cataqui@288484515/backend@1252587238:environment:staging") &&
      strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "repo:Cataqui@288484515/backend@1252587238:environment:production")
    )
    error_message = "GitHub trust must use the repository's immutable OIDC subject prefix."
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

run "environment_api_prerequisites" {
  command = plan

  assert {
    condition = (
      length(google_project_service.identity) == 6 &&
      alltrue([
        for environment in ["staging", "production"] :
        google_project_service.identity["${environment}:cloudresourcemanager.googleapis.com"].project == local.environments[environment].project_id &&
        google_project_service.identity["${environment}:cloudresourcemanager.googleapis.com"].service == "cloudresourcemanager.googleapis.com" &&
        !google_project_service.identity["${environment}:cloudresourcemanager.googleapis.com"].disable_on_destroy
      ])
    )
    error_message = "Bootstrap must enable Cloud Resource Manager in both projects before CI uses them as quota projects."
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
