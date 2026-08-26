output "project_id" {
  description = "Globally unique identifier of the environment's Google Cloud project."
  value       = google_project.cataqui.project_id
}

output "project_number" {
  description = "Google-assigned numeric identifier of the environment's project."
  value       = google_project.cataqui.number
}
