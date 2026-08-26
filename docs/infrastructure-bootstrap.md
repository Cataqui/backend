# Infrastructure bootstrap runbook

## Purpose

Use this runbook to establish or reconcile the privileged infrastructure and trust roots that normal OpenTofu execution cannot create without a circular dependency. Bootstrap runs locally, covers both staging and production, and prepares remote state, provider credentials, identities, environments, and deployment trust. It does not apply ordinary product infrastructure roots.

> [!CAUTION]
> `pnpm infrastructure:bootstrap` is immediately mutating. It has no plan or check mode and reconciles both staging and production. Do not run it as a test or as part of ordinary local setup.

## Prerequisites

These external account boundaries must already exist and match [`infrastructure/platforms.json`](../infrastructure/platforms.json):

- the Cloudflare account, with R2 activated;
- the Google Cloud organization and billing account;
- the Infisical organization;
- the paid Neon organization;
- the Upstash account;
- the `Cataqui/backend` GitHub repository.

The local operator must be able to manage:

- Cloudflare R2 resources and API tokens in the configured account;
- projects in the configured Infisical organization;
- Neon personal API keys and organization API-key administration;
- Google Cloud projects, billing attachment, service accounts, Workload Identity Federation, and required IAM bindings—the Google principal needs Project Creator on the organization and Billing Account User on the billing account at minimum;
- GitHub environments, deployment branch policies, and environment variables for the repository.

Install the repository dependencies and authenticate every required CLI from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
infisical login
gcloud auth login
gcloud auth application-default login
gh auth login
pnpm exec neon auth
```

Confirm that Wrangler is authenticated to the configured Cloudflare account, GitHub CLI resolves the configured repository, Neon uses an OAuth-authenticated `DEFAULT` profile, and Google Application Default Credentials are available. Bootstrap verifies these identities before making changes.

The following values originate outside bootstrap and are requested through hidden prompts only when no healthy stored value exists:

- a Cloudflare API token with `API Tokens Write`;
- an account-wide Upstash Management API key from the Upstash Console;
- the Meta app secret used by the Webhooks runtime.

Never commit these values or pass them through command arguments. Bootstrap stores its provider credentials in Infisical's single `/opentofu/bootstrap` folder; it does not create child folders beneath that path.

## Procedure

### 1. Confirm the live scope

Review [`infrastructure/platforms.json`](../infrastructure/platforms.json) for externally owned account coordinates and [`infrastructure/manifest.json`](../infrastructure/manifest.json) for repository-owned resource identities. Confirm that the authenticated accounts and the `staging` and `production` targets are correct.

### 2. Run bootstrap

From the repository root, run:

```sh
pnpm infrastructure:bootstrap
```

If prompted, enter the missing manually issued values interactively. Do not redirect output to a shared log or persist terminal history containing secret material.

Bootstrap creates, imports, reuses, or reconciles:

- the Infisical project, staging and production environments, `/opentofu/bootstrap`, generated secret folders, environment-scoped OIDC identities, and identity permissions;
- the private Cloudflare R2 state bucket and environment-scoped R2 credentials;
- the foundational `infisical-generated-folders` OpenTofu root for staging and production, using the same remote state later used by CI;
- the Meta Webhooks runtime secret, Upstash management credential, and one shared Neon account bootstrap issuer;
- Google Cloud projects, billing attachment, GitHub Workload Identity Federation, service accounts, and required IAM bindings;
- GitHub staging and production environments, deployment branch policies, and the environment variables required for Infisical and Google authentication.

Bootstrap is state-aware and repeatable: it inspects live resources and applicable OpenTofu state, adopts a valid existing resource when needed, reconciles owned configuration, and fails closed on ambiguous or foreign resources.

## Verification

The command succeeds only after it verifies the reconciled identities and credentials. A successful run ends with:

```text
Infrastructure bootstrap is healthy.
```

After bootstrap:

- confirm the staging and production GitHub environments have the expected branch policies and authentication variables;
- confirm the expected values exist in `/opentofu/bootstrap` and the generated runtime folders without printing their contents;
- apply `cloudflare-api-tokens` before application deployment so each application receives its environment-specific Workers credential under `/generated/<app>/deployment`;
- run `pnpm check:opentofu` to validate the normal OpenTofu roots without applying them;
- continue with the [deployment runbook](deployment.md) when the infrastructure is ready to reconcile and deploy.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| A CLI identity check fails before reconciliation | The active account, repository, profile, or Application Default Credentials do not match the configured platform | Reauthenticate the named CLI, confirm the live account against `infrastructure/platforms.json`, and rerun bootstrap. |
| Bootstrap reports a missing credential in a non-interactive terminal | No healthy stored bootstrap value exists and the process cannot prompt securely | Rerun from an interactive terminal and enter the value through the hidden prompt. |
| Bootstrap reports an ambiguous, foreign, or duplicate resource | Live provider state cannot be safely attributed to this repository | Stop. Inspect the named provider resource and OpenTofu state; do not delete, import, or replace it until ownership is established. |
| A provider request times out or is rate-limited | Credential health or resource state is indeterminate | Retry after the provider recovers. Do not treat an indeterminate result as proof that a credential is invalid. |
| Bootstrap stops after partially reconciling providers | A later provider failed after earlier idempotent changes completed | Resolve the reported failure and rerun the complete command. Bootstrap re-inspects and reuses healthy owned resources. |

## Recovery and escalation

Bootstrap has no global rollback because it spans external providers and establishes durable trust roots. Do not manually delete resources or revoke credentials merely because a later step failed. Preserve the error, determine which providers completed, resolve the failure, and rerun the state-aware reconciliation.

Escalate to the backend repository administrators when ownership is ambiguous, a protected resource is missing, a credential cannot be verified conclusively, or provider state conflicts with OpenTofu state. Include the failing phase, environment, resource name or non-secret identifier, command output with secrets removed, and timestamps. Never include token values, connection URLs, state files, saved plans, or secret-file contents.
