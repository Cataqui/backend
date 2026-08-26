# Backend deployment runbook

## Purpose

Use this runbook for staging and production deployments from `Cataqui/backend`. The workflow reconciles infrastructure, validates and applies database migrations, deploys the API, then deploys dependent Workers. It never rewinds a database migration automatically.

## Prerequisites

- Local infrastructure bootstrap has completed successfully.
- The selected GitHub environment has its required reviewers and branch policy, `INFISICAL_OPENTOFU_IDENTITY_ID`, `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, and `GOOGLE_OPENTOFU_SERVICE_ACCOUNT`.
- `/opentofu/bootstrap` contains healthy R2, provider, Neon account, and Upstash credentials; each `/generated/<app>/deployment` folder contains that application's environment-scoped Cloudflare Workers token; `/generated/api/deployment` also contains the project-scoped Neon key; `/generated/webhooks/runtime` contains the Meta app secret and generated webhook verification token.
- CI is green for the exact commit. Production application source must already have a successful staging deployment and remain unchanged on the path to `main`.
- Cloudflare, Neon, Infisical, Google Cloud, and GitHub status pages show no incident affecting deployment.

## Normal deployment

Push to `staging` for staging or merge the staging-proven commit to `main` for production. CI calls the reusable deployment workflow after the full repository gate.

Confirm these signals in order:

1. Every OpenTofu root applies its exact saved plan without exposing raw plans; Neon projects precede their project-scoped API keys and database access.
2. The Neon validation branch is created with a 24-hour expiry, migrations and the candidate API pass, and the branch is deleted.
3. The real Neon `main` branch reports `prisma migrate status` clean.
4. API liveness returns `204`; readiness and JWKS return `200` for five consecutive probes.
5. Geosearch returns `204` through its candidate override and every rollout stage.
6. Webhooks accepts the signed empty WhatsApp payload with `200`; the empty `entry` list must produce no internal forwarding.

Infrastructure-only changes still reconcile all roots but do not deploy applications. Manual `all` forces API, Geosearch, and Webhooks in that order.

## Migration compatibility

The deployment workflow applies every pending Prisma migration after validating it on an expiring Neon branch. It does not classify or automatically reject destructive SQL, so migration compatibility must be reviewed before merging.

Use expand and contract as separate releases when a schema change can break the currently deployed API:

1. Expand the schema with backward-compatible additions.
2. Deploy API code that no longer depends on the old schema and confirm it is healthy in staging and production.
3. Add the destructive cleanup migration in a later release only after the deployed API tolerates the contracted schema.

Do not combine a column or table removal with the application change that stops using it. A Cloudflare rollback cannot undo a database migration, and Prisma migrations are never automatically rewound by this workflow.

## Automatic rollback triggers

- API: deployment failure, a terminal Container rollout failure, rollout timeout, or three consecutive failed public probes restores the captured Worker version and its retained container target.
- Geosearch or Webhooks: failed candidate smoke or two consecutive rollout probe failures restores the previous version at 100%.
- First deployment: there is no previous version. The workflow stops and declares a first-deployment incident; it must not claim rollback succeeded.

Rollback does not revert OpenTofu changes, database migrations, external provider state, or deleted resources. Old Cloudflare container images must remain available because retained Worker versions depend on them.

## Delayed manual rollback

When a defect appears after workflow success, select the last known-good version in Cloudflare Workers & Pages and restore it at 100%, or run Wrangler rollback with the exact retained version. Verify the same public probes afterward. Do not roll back application code across a destructive migration unless compatibility has been explicitly established.

## Failed migration recovery

If only the ephemeral branch fails, inspect the migration and candidate logs, fix forward, and rerun. The branch deletion trap runs automatically; its 24-hour expiry is the fallback.

If the real migration fails, stop application deployment. Inspect Prisma migration state and PostgreSQL locks, then use Prisma's forward-recovery procedure. Never edit an applied migration, reset a shared database, or mark a failed migration resolved without confirming the actual database state.

Neon point-in-time recovery is a last-resort incident operation. Preserve evidence, stop writes where necessary, create a recovery branch at the chosen timestamp, validate data and schema, and obtain backend administrator approval before any ownership or traffic change.

## Partial Container rollout

If Cloudflare reports a partial rollout after the workflow stops, keep the previous image and Worker version. Restore the captured Worker version, watch Container state until replacement settles, and require liveness, readiness, and JWKS recovery. If rollback itself is unhealthy, stop further deploys and escalate.

## Escalation

Escalate to the backend repository administrators with the environment, commit SHA, GitHub run ID/attempt, failed phase, Cloudflare deployment/version IDs, Neon branch ID, probe statuses, and timestamps. Do not include tokens, connection URLs, raw plans, state, webhook signatures, or secret-file contents.
