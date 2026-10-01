module "infisical_project" {
  source = "../../modules/infisical-project"

  organization_id = local.platforms.infisical.organization_id
  project_name    = local.manifest.infisical.project.name
  project_slug    = local.manifest.infisical.project.slug
  environment     = var.environment
}
