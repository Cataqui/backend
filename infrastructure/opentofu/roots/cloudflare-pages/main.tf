resource "cloudflare_pages_project" "landing" {
  account_id        = local.cloudflare_account_id
  name              = local.project_name
  production_branch = local.branch

  source = {
    type = "github"
    config = {
      owner                          = "Cataqui"
      owner_id                       = "288484515"
      repo_name                      = "landing"
      repo_id                        = "1402140165"
      production_branch              = local.branch
      production_deployments_enabled = true
      preview_deployment_setting     = "none"
      pr_comments_enabled            = false
    }
  }

  build_config = {
    root_dir        = "/"
    build_command   = "pnpm run validate"
    destination_dir = "dist"
    build_caching   = true
  }

  deployment_configs = {
    production = {
      build_image_major_version = 3
      env_vars = {
        NODE_VERSION = { type = "plain_text", value = "24.19.0" }
        PNPM_VERSION = { type = "plain_text", value = "11.17.0" }
      }
    }
    preview = {
      build_image_major_version = 3
      env_vars = {
        NODE_VERSION = { type = "plain_text", value = "24.19.0" }
        PNPM_VERSION = { type = "plain_text", value = "11.17.0" }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_pages_domain" "landing" {
  for_each = local.domains

  account_id   = local.cloudflare_account_id
  project_name = cloudflare_pages_project.landing.name
  name         = each.key

  lifecycle {
    prevent_destroy = true
  }
}
