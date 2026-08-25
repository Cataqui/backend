output "workload_identity_provider" {
  description = "Fully qualified Google Workload Identity Provider name used by GitHub Actions."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_emails" {
  description = "Environment-scoped Google service accounts used by OpenTofu in GitHub Actions."
  value = {
    for environment, service_account in google_service_account.opentofu :
    environment => service_account.email
  }
}
