locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  infisical_project_id = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)
}
