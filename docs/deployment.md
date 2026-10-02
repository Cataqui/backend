# Backend deployment runbook

## Purpose

Use this runbook to deploy, verify, and recover staging and production releases from `Cataqui/backend`.

## Prerequisites

- [Infrastructure bootstrap](infrastructure-bootstrap.md), including manually supplied application keys, has completed successfully.
- The selected GitHub environment has its required reviewers and branch policy, `INFISICAL_OPENTOFU_IDENTITY_ID`, `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, and `GOOGLE_OPENTOFU_SERVICE_ACCOUNT`.
- CI is green for the exact commit. Production application source must already have a successful staging deployment and remain unchanged on the path to `main`.
- Cloudflare, Neon, Infisical, Google Cloud, Geoapify, and GitHub status pages show no incident affecting deployment.

## Normal deployment

Push to `staging` for staging or merge the staging-proven commit to `main` for production. Wait for CI and the deployment workflow to succeed.

For a manual run, choose the intended scope in the Deploy workflow:

- `infrastructure`: reconcile infrastructure without deploying applications.
- `all`: deploy all applications.
- An application scope: deploy the selected application and its required dependencies. The API scope deploys Maps before the API; Webhooks follows the API when both are selected. Authenticated Maps place requests require its configured API JWKS endpoint to be healthy.

Resolve any partial active rollout before starting another deployment.

For an environment still using the retired job-derivation queues, deploy the API to complete that migration. Infrastructure-only runs retain those queues. Once the API migration deletes them, do not restore an older API version that requires them; recover forward or explicitly restore the required queue infrastructure and consumer configuration first.

## Deployment verification

Confirm infrastructure reconciliation and migration checks succeeded, and the real Neon `main` branch reports `prisma migrate status` clean. Confirm the deployment probes passed:

- API liveness returns `204`; readiness and JWKS return `200`.
- Maps health returns `204`.
- Webhooks accepts the signed empty WhatsApp payload with `200` without internal forwarding.

Before releasing Maps changes to production, create a job through the normal staging flow and verify that its returned location image URL serves every variant used by the client as WebP. Repeat the image reads to verify stored-image delivery and public CDN reuse. Static images are public; place search and details require a Maps access token issued by the API. Keep access tokens out of logs and URLs. CI health probes do not check image preparation, storage, or public image delivery.

## Migration compatibility

Review every pending Prisma migration for compatibility before merging. CI does not automatically reject destructive SQL.

The Maps rollout prepares images for newly created jobs only. Existing jobs are not backfilled automatically and require a separate backfill before deploying the new API to an environment containing those rows. Until their location image URLs are populated, those jobs cannot satisfy the API output contract.

Use expand and contract as separate releases when a schema change can break the currently deployed API:

1. Expand the schema with backward-compatible additions.
2. Deploy API code that no longer depends on the old schema and confirm it is healthy in staging and production.
3. Add the destructive cleanup migration in a later release only after the deployed API tolerates the contracted schema.

Do not combine a column or table removal with the application change that stops using it. A Cloudflare rollback cannot undo a database migration, and Prisma migrations are never automatically rewound by this workflow.

## Automatic rollback triggers

- API: deployment failure, a terminal Container rollout failure, rollout timeout, or three consecutive failed public probes restores the captured Worker version and its retained container target.
- Webhooks: failed candidate smoke or two consecutive rollout probe failures restores the previous version at 100%.
- Maps: deployment failure, three consecutive failed health probes, or health verification timeout attempts to restore the previous version. Maps releases receive 100% of traffic immediately; a failed check can affect users before restoration. If the release applied a Durable Object lifecycle change, restoration to earlier versions is unavailable; inspect the deployment and recover forward.
- First deployment: there is no previous version. The workflow stops and declares a first-deployment incident; it must not claim rollback succeeded.

Rollback does not revert OpenTofu changes, database migrations, external provider state, or deleted resources. Old Cloudflare container images must remain available because retained Worker versions depend on them.

## Delayed manual rollback

When a defect appears after workflow success, select the last known-good version in Cloudflare Workers & Pages and restore it at 100%, or run Wrangler rollback with the exact retained version. Verify the same public probes afterward. Do not roll back application code across a destructive migration unless compatibility has been explicitly established.

## Failed migration recovery

If only the validation branch fails, inspect the migration and candidate logs, fix forward, and rerun. Confirm the temporary branch was cleaned up; its 24-hour expiry is the fallback.

If the real migration fails, stop application deployment. Inspect Prisma migration state and PostgreSQL locks, then use Prisma's forward-recovery procedure. Never edit an applied migration, reset a shared database, or mark a failed migration resolved without confirming the actual database state.

Neon point-in-time recovery is a last-resort incident operation. Preserve evidence, stop writes where necessary, create a recovery branch at the chosen timestamp, validate data and schema, and obtain backend administrator approval before any ownership or traffic change.

## Partial Container rollout

If Cloudflare reports a partial rollout after the workflow stops, keep the previous image and Worker version. Restore the captured Worker version, watch Container state until replacement settles, and require liveness, readiness, and JWKS recovery. If rollback itself is unhealthy, stop further deploys and escalate.

## Escalation

Escalate to the backend repository administrators with the environment, commit SHA, GitHub run ID/attempt, failed phase, Cloudflare deployment/version IDs, Neon branch ID, probe statuses, and timestamps. Do not include tokens, connection URLs, raw plans, state, webhook signatures, or secret-file contents.
