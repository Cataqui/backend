# AGENTS.md — GitHub Automation

These instructions apply to the GitHub automation scope containing this file.

## Prefer Maintained Automation

Prefer official, provider-maintained CLIs or GitHub Actions over custom Bash that reimplements a provider API, authentication flow, retry policy, serialization format, or create/update behavior. Before adding a shell implementation, check the provider's current documentation, official GitHub organization, CLI, and Marketplace publisher.

Marketplace availability alone is not evidence that an action is safe. Use an action only when its publisher and source repository are trustworthy, its permissions and data access are understood, and it materially reduces maintained code. Pin every external action to a full commit SHA and keep the human-readable release tag in a comment. Pin every downloaded CLI to an exact version and verify its published checksum or lockfile integrity before execution. Do not approve dependency lifecycle scripts that download unverified executables.

Direct shell commands remain appropriate for short orchestration around an official CLI, repository-local validation, and behavior for which no maintained tool exists. Keep those blocks fail-closed with `set -euo pipefail`, avoid printing credentials, and extract them only when they become complex enough to need focused tests or genuine reuse.

## Infisical Environment Names

Infisical is the source of truth for deployment credentials and linked provider configuration. Jobs that select a GitHub environment must authenticate to the matching Infisical environment through the shared credential-loading action and GitHub OIDC. Do not copy deployment credentials into GitHub Actions secrets.

Use the same credential names and profile folders in the Infisical `staging` and `production` environments. Never encode an environment in a credential name or add workflow conditionals that select environment-specific names. The protected GitHub environment and job pass the matching Infisical environment slug.

Only these non-secret bootstrap identifiers belong in GitHub Actions variables:

- repository variable `INFISICAL_IDENTITY_ID`;
- repository variable `INFISICAL_PROJECT_ID`;
- repository variable `INFISICAL_PROJECT_SLUG`.

Every authenticated job must request `id-token: write` alongside the minimum existing permissions. Bind the Infisical machine identity to the repository, staging and production environment subjects, permitted branches, exact workflow set, repository ID, and owner ID. Use bounded OIDC alternatives rather than unrestricted wildcards. Keep credentials in non-recursive profile folders without secret imports. The shared identity requires write access because Terraform deployments synchronize generated runtime credentials into `/runtime` and Neon migration configuration into `/database`.

Fetch credentials only after dependency and tool setup. Keep the Infisical action in file-export mode, validate the exact credential set without sourcing the file, mask outputs, delete the file immediately, and pass each output only to its consuming step.

## Adding a New Environment Variable

In addition to the application and Cloudflare environment registrations required by the repository-wide guidance, update every applicable GitHub automation owner:

1. **Infisical** — Add the same name to the applicable isolated profile folder in the `staging` and `production` project environments with their environment-specific values.
2. **Credential profile registry** — Add the name to every deployment responsibility that consumes it.
3. **Environment deployment workflows** — Forward the fetched value to the application or deployment action in every deployed environment.
4. **Owning Worker configuration** — Declare stable, non-sensitive Worker configuration directly in the environment-specific variables when it benefits from code review. Generated connection configuration may remain in Infisical beside its credential.

Do not skip any applicable location. Missing one means the variable will not reach the container in that environment.
