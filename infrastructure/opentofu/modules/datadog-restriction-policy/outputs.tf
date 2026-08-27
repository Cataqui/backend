output "id" {
  description = "Datadog restriction-policy identifier."
  value       = datadog_restriction_policy.this.id
}

output "bindings" {
  description = "Typed viewer and editor principal sets enforced by the restriction policy."
  value = {
    editors = var.editor_principals
    viewers = var.viewer_principals
  }
}
