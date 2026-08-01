# AGENTS.md — GitHub Automation

These instructions apply to all files under `.github/`.

## Environment Secret Names

Jobs that select a GitHub environment must use the same secret and token names in every environment and rely on the job's `environment` selection to supply the correct value. Never encode `staging`, `production`, or another environment name into an environment-scoped secret name, and never add workflow conditionals that choose between environment-specific secret names.

For example, define `CLOUDFLARE_TERRAFORM_READ_API_TOKEN` separately in the `staging` and `production` environments, then reference `secrets.CLOUDFLARE_TERRAFORM_READ_API_TOKEN` after the job selects its environment. Do not create `CLOUDFLARE_TERRAFORM_STAGING_READ_API_TOKEN` and `CLOUDFLARE_TERRAFORM_PRODUCTION_READ_API_TOKEN`.

## Adding a New Environment Variable

In addition to the application and Cloudflare environment registrations required by the repository-root `AGENTS.md`, update the following GitHub Actions locations:

1. **`.github/workflows/deploy-staging.yml`** — Add the variable to the `secrets:` list if it is sensitive, or add it to `wrangler.jsonc` under `env.*.vars` if it is non-sensitive configuration such as a URL or feature flag. Add it to the job's `env:` block when using a GitHub secret.
2. **`.github/workflows/deploy-production.yml`** — Apply the same registration as staging.
3. **GitHub repository secrets** — For sensitive values, add the same secret name under each relevant GitHub environment in repository settings at **Secrets and variables → Actions**. For non-sensitive values, define the value in `wrangler.jsonc` under `env.*.vars` instead.

Do not skip any applicable location. Missing one means the variable will not reach the container in that environment.
