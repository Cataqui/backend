locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id = module.infisical_project.id

  # Every other Datadog OpenTofu root gets its own API key and application key limited to these scopes. Add a root
  # or a scope here and deploy; the bootstrap never has to run again for it.
  opentofu_roots = {
    datadog-observability = {
      scopes = [
        "dashboards_read",
        "dashboards_write",
        "logs_read_data",
        "logs_read_index_data",
        "monitors_read",
        "monitors_write",
        "synthetics_read",
        "synthetics_write",
      ]
    }
  }
}
