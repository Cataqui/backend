output "project" {
  description = "Non-secret identity and placement of the environment's Neon database project."
  value = {
    project_id   = neon_project.database.id
    project_name = neon_project.database.name
    branch_id    = neon_project.database.default_branch_id
    branch_name  = local.database_configuration.branch_name
    database     = neon_project.database.database_name
    owner_role   = neon_project.database.database_user
    app_role     = neon_role.app.name
    region       = neon_project.database.region_id
    pg_version   = neon_project.database.pg_version
  }
}

output "database_owner_direct_url" {
  description = "Sensitive direct PostgreSQL URL used by Prisma migrations."
  value       = neon_project.database.connection_uri
  sensitive   = true
}

output "database_app_pooler_url" {
  description = "Sensitive pooled PostgreSQL URL for the least-privilege Cloudflare application role."
  value = format(
    "postgresql://%s:%s@%s/%s?sslmode=require&channel_binding=require",
    urlencode(neon_role.app.name),
    urlencode(neon_role.app.password),
    neon_project.database.database_host_pooler,
    neon_project.database.database_name,
  )
  sensitive   = true
}
