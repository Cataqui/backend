mock_provider "cloudflare" {}

run "staging_branch_and_build" {
  command = plan
  variables { environment = "staging" }
  assert {
    condition = (
      cloudflare_pages_project.landing.name == "cataqui-landing-staging" &&
      cloudflare_pages_project.landing.production_branch == "staging" &&
      cloudflare_pages_project.landing.source.config.production_branch == "staging" &&
      cloudflare_pages_project.landing.source.config.repo_name == "landing" &&
      cloudflare_pages_project.landing.source.config.owner == "Cataqui" &&
      cloudflare_pages_project.landing.source.config.repo_id == "1402140165" &&
      cloudflare_pages_project.landing.source.config.preview_deployment_setting == "none" &&
      cloudflare_pages_project.landing.build_config.build_command == "pnpm run validate" &&
      cloudflare_pages_project.landing.build_config.destination_dir == "dist" &&
      cloudflare_pages_project.landing.build_config.build_caching &&
      cloudflare_pages_project.landing.deployment_configs.production.env_vars["NODE_VERSION"].value == "24.19.0" &&
      cloudflare_pages_project.landing.deployment_configs.production.env_vars["PNPM_VERSION"].value == "11.17.0" &&
      toset(keys(cloudflare_pages_domain.landing)) == toset(["staging.cataqui.com"])
    )
    error_message = "Staging must build only its staging branch with the landing toolchain and its registered staging domain."
  }
}

run "production_branch" {
  command = plan
  variables { environment = "production" }
  assert {
    condition = (
      cloudflare_pages_project.landing.name == "cataqui-landing-production" &&
      cloudflare_pages_project.landing.production_branch == "main" &&
      cloudflare_pages_project.landing.source.config.production_branch == "main" &&
      cloudflare_pages_project.landing.source.config.production_deployments_enabled &&
      toset(keys(cloudflare_pages_domain.landing)) == toset(["cataqui.com", "www.cataqui.com"])
    )
    error_message = "Production must build main independently and register apex and www."
  }
}

run "reject_unsupported_environment" {
  command = plan
  variables { environment = "development" }
  expect_failures = [var.environment]
}
