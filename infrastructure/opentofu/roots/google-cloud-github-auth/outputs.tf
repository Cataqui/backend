output "workload_identity_provider" {
  description = "Fully qualified Google Workload Identity Provider name used by GitHub Actions."
  value       = google_iam_workload_identity_pool_provider.github.name
}
