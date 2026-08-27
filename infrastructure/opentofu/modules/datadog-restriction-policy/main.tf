resource "datadog_restriction_policy" "this" {
  resource_id = var.resource_id

  bindings {
    principals = var.viewer_principals
    relation   = "viewer"
  }

  bindings {
    principals = var.editor_principals
    relation   = "editor"
  }
}
