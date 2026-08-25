# AGENTS.md — Infrastructure Bootstrap

These instructions supplement the repository root and `infrastructure/AGENTS.md` instructions for `infrastructure/bootstrap`.

## Purpose and boundary

This directory owns the privileged bootstrap that establishes the infrastructure and trust roots that OpenTofu cannot create by itself. It prepares the providers, remote state, credentials, identities, environments, and other prerequisites that must exist before the normal OpenTofu roots can initialize and reconcile the rest of Cataquí's infrastructure.

Keep this boundary narrow. Put a resource here only when creating or adopting it through the ordinary OpenTofu roots would be circular or impossible, such as the credentials required to access the OpenTofu backend or authenticate the provider that creates them. Move ordinary declarative infrastructure into `infrastructure/opentofu/roots`.

## Mandatory state-aware reconciliation

Every bootstrap operation must be safely repeatable and state-aware:

1. Inspect both the provider's live resource and the relevant OpenTofu state, when state applies, before mutating anything.
2. If exactly one healthy resource already exists and belongs to this bootstrap, reuse it without recreating it.
3. If a valid live resource exists but is not yet in OpenTofu state, adopt or import it without changing the live resource during that first import.
4. If no resource exists, create it with the expected stable identity and least privilege.
5. Reconcile mutable configuration only after ownership has been established.
6. Verify the resulting configuration and, for credentials, prove that the credential works against its intended resource.

Never use a blind create, treat every inspection failure as absence, or silently select one result from multiple matches. Fail closed when discovery is ambiguous, state references an unexpected or missing protected resource, a same-named resource has foreign ownership or policy, or the provider cannot conclusively distinguish absence from an interrupted or unauthorized check.

## Existing implementation patterns

- Keep `bootstrap.mjs` as the small, argument-free orchestrator. Put provider behavior in `<provider>-bootstrap.mjs`, pure decisions in `<provider>-reconciliation.mjs`, and shared execution, validation, comparison, and redaction helpers in the existing runtime/reconciliation modules.
- Read externally established provider coordinates from `infrastructure/platforms.json` and repository-owned desired resource identities from `infrastructure/manifest.json`; validate both exact shapes and supported environments before provider operations. Do not add another bootstrap-specific manifest or hidden environment fallbacks.
- Reconcile both `staging` and `production` from the shared `ENVIRONMENTS` source unless a resource is intentionally global. Keep environment-specific identities, credentials, state keys, and GitHub environment policy separate.
- Discover resources by stable expected names and verify ownership-defining attributes, not names alone. Require uniqueness with `resolveUniqueNamedResource` or an equally strict provider-specific check.
- Separate discovery and decision logic from side effects. Model explicit outcomes such as `create`, `reuse`, `import`, `reconcile`, or `replace`, and unit-test every outcome plus ambiguous, foreign, partial, stale, and provider-error states.
- Preserve user-controlled settings when updating shared provider objects. For example, GitHub environment reconciliation carries forward existing reviewers, wait timers, and self-review policy while owning branch policy and bootstrap variables.
- Serialize local runs with the bootstrap lock, validate required CLI authentication up front, and reject command-line modes or flags that would make behavior diverge between runs.
- Use temporary OpenTofu plan files with unpredictable names, apply the saved plan, and remove it in `finally`. Initialize each root against its explicit environment-specific backend; do not use Terraform workspaces for isolation.
- After mutation, read the resource back and compare the owned contract. Temporary functional probes must use unique markers and clean up only their own data.

## Credentials and destructive changes

- A bootstrap identity must never create or rotate the credential it needs to authenticate itself. Keep that manual root of trust outside OpenTofu and store bootstrap inputs only in Infisical's single `/opentofu/bootstrap` folder as required by the parent instructions.
- Never put secret values in `platforms.json`, `manifest.json`, OpenTofu variables, state outputs, logs, errors, command arguments, committed files, or test fixtures. Register every acquired or generated secret in `knownSecrets` immediately, redact provider and subprocess errors, and use constant-time comparison for credential values.
- Validate stored credentials before reuse. Replace them only when the complete owned credential set is missing, inactive, inconsistent, or conclusively rejected. A timeout, rate limit, server failure, or indeterminate provider response is not proof that a credential is invalid.
- Destructive replacement is allowed only for a resource whose ownership and exact scope were verified first. Create/store/verify the replacement according to the provider's safe lifecycle, and never delete a foreign, ambiguous, or merely drifted resource.

## Validation

Add or update focused cases in `test/infrastructure-bootstrap.spec.ts` for reconciliation and safety behavior. At minimum run:

```sh
pnpm exec vitest run --config vitest.config.ts test/infrastructure-bootstrap.spec.ts
pnpm lint:check
git diff --check
```

Do not run `pnpm infrastructure:bootstrap` as a test: it performs privileged live mutations across staging and production. Run it only when the user explicitly requests the live bootstrap and the required local Cloudflare, Infisical, Google Cloud, GitHub, and OpenTofu authentication has been confirmed.
