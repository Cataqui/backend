output "subdomain" {
  description = "Actual Pages hostname consumed by the zone DNS root."
  value       = cloudflare_pages_project.landing.subdomain
}

output "domains" {
  description = "Domains registered with Pages before DNS routes traffic to them."
  value       = keys(cloudflare_pages_domain.landing)
}
