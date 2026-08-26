import {
  for_each = var.enable_imports ? toset(["enabled"]) : toset([])
  to       = google_project.cataqui
  id       = local.project.id
}
