# AGENTS.md — Infrastructure

These instructions supplement the repository root instructions for `infrastructure`.

- Every deployable OpenTofu root owns an independent state key under `<environment>/<root>/terraform.tfstate`.
- Keep `platforms.json` for stable, non-secret coordinates of externally established provider accounts and ownership boundaries. Keep `manifest.json` for stable, non-secret names and identifiers of resources that bootstrap or OpenTofu creates, adopts, or reconciles. Keep root-specific and environment-specific policy configuration in that root's locals unless multiple roots genuinely consume it.
- Never hardcode or commit a secret, provider credential, private key, database URL, or other secret value in HCL, backend configuration, variables files, outputs, tests, or fixtures.
- Prefer keyless authentication or direct generation into Infisical so secret material never passes through OpenTofu. If OpenTofu is the only viable way to generate a required credential, it may do so and transfer it directly to Infisical; never expose the value through outputs, logs, command arguments, plans saved as artifacts, or committed files.
- Treat state and plans as sensitive because generated credentials may remain there even when an attribute is marked `sensitive` or has already been copied to Infisical.
- Keep every manually issued credential that OpenTofu needs to initialize or authenticate outside OpenTofu and store all of them together in the single Infisical folder `/opentofu/bootstrap`; do not create bootstrap child folders. An OpenTofu root must never issue or rotate a credential that it needs to authenticate itself.
- Resolve Cloudflare API token permission-group IDs through the pinned provider using the plain permission name and exact scope, and fail unless each lookup returns exactly one group.
- Use exact types and fail-closed validation. Do not use `any`, permissive defaults, hidden environment fallbacks, or Terraform workspaces for environment isolation.
