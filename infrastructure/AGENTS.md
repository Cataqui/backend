# AGENTS.md — Infrastructure

These instructions supplement the repository root instructions for `infrastructure`.

- Every deployable OpenTofu root owns an independent state key under `<environment>/<root>/terraform.tfstate`.
- Keep `platforms.json` for stable, non-secret identifiers shared across infrastructure roots. Keep root-specific and environment-specific policy configuration in that root's locals unless multiple roots genuinely consume it.
- Never hardcode or commit a secret, provider credential, private key, database URL, or other secret value in HCL, backend configuration, variables files, outputs, tests, or fixtures.
- Prefer keyless authentication or direct generation into Infisical so secret material never passes through OpenTofu. If OpenTofu is the only viable way to generate a required credential, it may do so and transfer it directly to Infisical; never expose the value through outputs, logs, command arguments, plans saved as artifacts, or committed files.
- Treat state and plans as sensitive because generated credentials may remain there even when an attribute is marked `sensitive` or has already been copied to Infisical.
- Use exact types and fail-closed validation. Do not use `any`, permissive defaults, hidden environment fallbacks, or Terraform workspaces for environment isolation.
