# Cataquí Backend

This repository contains the backend applications, shared packages, and infrastructure that power Cataquí—the real-time layer for discovering local jobs, gigs, and freelance opportunities.

It is a pnpm monorepo built around a main NestJS API, independently deployable Cloudflare Workers, shared TypeScript packages, and OpenTofu-managed infrastructure.

## Bootstrapping Infrastructure

The local bootstrap establishes the state backend and trust needed before GitHub Actions can apply the regular OpenTofu roots. It reconciles existing resources and creates missing ones, so it is safe to run again after bootstrap requirements change. It is also immediately mutating: it has no plan or check mode.

Before running it, the following external account boundaries must already exist and match [`infrastructure/platforms.json`](infrastructure/platforms.json):

- The Cloudflare account, with R2 activated.
- The Google Cloud organization and billing account.
- The Infisical organization.
- The paid Neon organization.
- The Upstash account.
- The `Cataqui/backend` GitHub repository.

The local operator must have enough access to manage the bootstrap-owned resources:

- Cloudflare R2 resources in the configured account.
- Projects in the configured Infisical organization.
- Neon organization API keys.
- Google Cloud projects, billing attachment, service accounts, Workload Identity Federation, and the required IAM bindings. The Google principal needs Project Creator on the organization and Billing Account User on the billing account at minimum.
- GitHub environments, deployment branch policies, and environment variables for the repository.

Two credentials must originate manually because bootstrap cannot create the credentials it needs to authenticate itself:

- A Cloudflare API token with `API Tokens Write`.
- An account-wide Upstash Management API key created in the Upstash Console.

Bootstrap requests either value through a hidden prompt only when no valid stored value exists. Do not commit them or pass them through command arguments.

Install the repository dependencies and authenticate every required CLI:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
infisical login
gcloud auth login
gcloud auth application-default login
gh auth login
pnpm exec neon auth
```

OpenTofu, the Infisical CLI, Google Cloud CLI, and GitHub CLI must also be installed locally. Then run the argument-free bootstrap from the repository root:

```sh
pnpm infrastructure:bootstrap
```

Bootstrap creates or reconciles the Infisical project and environments, `/opentofu/bootstrap`, the private R2 state bucket and credentials, Neon management keys, Google Cloud projects and GitHub authentication trust, Infisical OIDC identities, and GitHub environment configuration. It does not apply product infrastructure roots; deployment workflows can apply generated folders, provider-specific tokens, databases, queues, gateways, and the remaining infrastructure afterward.

## Structure

```text
apps/
├── api/                 Main NestJS API and Cloudflare container gateway
└── workers/             Cloudflare workers for specific tasks 

packages/                Shared TypeScript packages

infrastructure/
├── bootstrap/           Infrastructure bootstrap and reconciliation scripts
└── opentofu/            Environment and platform infrastructure definitions

test/                     Repository-level tests
```
