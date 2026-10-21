# Next deployment: Auth and Profile v1

Owner: Cataquí backend maintainers. Updated: 2026-10-21. The staging cutover is partially complete; production has not started.

This release replaces the unlaunched API authentication tables and User model with a separate Auth service and API Profiles. Both applications have fresh migration baselines. Existing development accounts, sessions, profiles, contacts, and jobs are disposable for this cutover. No data migration or old client compatibility is provided.

Complete this procedure for staging first, verify it, then repeat for production. Use the matching `staging` or `main` branch and environment-scoped credentials throughout. Normal later releases follow [the deployment runbook](docs/deployment.md).

## Execution status

- Staging infrastructure is reconciled. The separate Auth database, restricted roles, Redis and Hyperdrive are provisioned, Auth secret profiles resolve, and the existing Meta secret has been copied to Auth. The protected Webhooks deployment-token addresses have already been forgotten in staging state; their real credentials remain until callback verification and cleanup.
- Staging Mapshot was bootstrapped from an empty bucket. GitHub runners downloaded and verified the complete 129.47 GiB `20261020.pmtiles` archive and prepared the worldwide landmark/index artifacts. [Release verification passed](https://github.com/Cataqui/backend/actions/runs/39552459573) at `10fccf6c48763e5723273d3c136d3516350db25b`, including deployment, rollout verification and a live 960×960 WebP render.
- The approved staging API reset succeeded. Its actual tables now match the v1 baseline, with `profiles`, `jobs`, `contacts` and `job_post_requests`; the old API authentication tables are absent. The API now exposes only its declared portal methods to Nest, preventing lifecycle inspection from dispatching RPC calls before HTTP startup.
- [The latest full application delivery](https://github.com/Cataqui/backend/actions/runs/39588123391) passed validation, infrastructure, Mapshot and the API migration gate, then stopped at Auth's temporary-branch Worker health probe. A fresh runner lacked Auth's generated Prisma client. Auth compilation now generates its own client; its clean runtime regression and fresh temporary-branch migration/health probes pass. Repeat full delivery after this fix. Auth, Maps and API verification, Meta callback switching and the cleanup checklist remain pending. Application scopes `all`, `auth`, `maps` and `api` include API migrations through dependency expansion.
- Production API reset, application delivery, Mapshot resource reset and legacy cleanup have not started. Complete staging verification before repeating the procedure there. Retain both infrastructure `removed.tf` files until both environments have forgotten the listed legacy addresses.

## Before application delivery

1. Pause automatic delivery for the cutover by merging with `[skip ci]` in the merge commit message. The configured environments have no reviewer gate; do not rely on a pending approval. Run the infrastructure-only scope manually before the first application deployment. Manual dispatch validates the exact revision despite the push skip marker. This commit must not run application migrations against the old API schema.
2. Confirm the exact commit passes CI and that the maintainer operating the cutover has access to the selected Neon project, Infisical environment, Cloudflare account, and protected OpenTofu state. Stop if the environment contains data that must be retained; make a coordinated backup and agree on a migration before continuing.
3. Ensure the selected Meta application secret is available to its maintainer. Supply it to the new Auth runtime path after infrastructure succeeds. Leave existing Infisical folders in place during reconciliation. Retire the protected Webhooks deployment-token ownership as described below before reconciliation; no folder renames are required.

## Retire old deployment-token ownership once

Before the first infrastructure apply in each environment, initialize only the `cloudflare-api-tokens` root against that environment's backend using its matching bootstrap credentials. Confirm the selected backend key and list resource addresses only. The old `webhooks` instances have `prevent_destroy`; OpenTofu cannot remove them automatically, and a `removed` block cannot target a keyed instance.

Run these exact address-scoped operations in the initialized root, first with `-dry-run`, then without it:

```sh
tofu state rm -dry-run 'cloudflare_api_token.application_deployment["webhooks"]' 'infisical_secret.application_deployment_cloudflare_api_token["webhooks"]'
tofu state rm 'cloudflare_api_token.application_deployment["webhooks"]' 'infisical_secret.application_deployment_cloudflare_api_token["webhooks"]'
```

This forgets ownership without revoking the existing token or deleting its Infisical copy. Retain them until the callbacks and clients have switched, then perform the explicit cleanup below. Auth receives a new independently scoped deployment token. Never remove the API, Maps, Mapshot, infrastructure, or Auth token addresses. Repeat only for the environment currently being cut over.

## Provision infrastructure

From the intended revision on `staging`, dispatch the infrastructure-only deployment:

```sh
gh workflow run deploy.yml --ref staging -f scope=infrastructure
```

Use `--ref main` for production. Wait for the selected environment's run to finish successfully before resetting a database or deploying applications. Resolve infrastructure failures before continuing.

Verify in the provider consoles that the environment has an `auth` database in its existing Neon project, distinct `auth_owner` and `auth_user` roles, a dedicated `cataqui-auth-<environment>` Redis database, and a matching Hyperdrive configuration with query caching disabled. The API continues using `cataqui` and its existing rate-limit Redis.

The restricted Hyperdrive origin password is retained in protected OpenTofu state. Keep state and plans private. The deployment action obtains the generated Hyperdrive ID from Infisical; no Wrangler ID needs to be copied into source.

Infrastructure generates the refresh HMAC key and webhook verification token. Transfer the existing Meta app secret using the CLI procedure below, then verify the Auth runtime/deployment secret profiles resolve successfully before application delivery.

## Transfer the Meta secret once

After infrastructure succeeds, use the authenticated Infisical CLI to copy only `META_APP_SECRET` from `/generated/webhooks/runtime` to `/generated/auth/runtime` in the same environment. This is an operator step; no additional deployment automation is needed.

Confirm the CLI is authenticated to the configured Infisical organization. Replace the project UUID below with the ID of the `Cataquí Backend` project. Run for `staging` first; change `environment` to `production` only when cutting over production.

```sh
ruby <<'RUBY'
require "tempfile"

environment = "staging"
project_id = "REPLACE_WITH_CATAQUI_BACKEND_PROJECT_UUID"
abort "Set the Cataquí Backend project UUID first." if project_id.start_with?("REPLACE_")
abort "Unsupported environment." unless %w[staging production].include?(environment)
options = ["--env", environment, "--projectId", project_id, "--silent"]

Tempfile.create(["cataqui-meta-", ".env"]) do |file|
  copied = system("infisical", "secrets", "get", "META_APP_SECRET", *options,
                  "--path", "/generated/webhooks/runtime", "--output", "dotenv",
                  "--secret-overriding=false", "--include-imports=false", "--expand=false", out: file)
  abort "Could not read the existing Meta secret; stop the cutover." unless copied && file.size.positive?
  file.flush
  transferred = system("infisical", "secrets", "set", *options,
                       "--path", "/generated/auth/runtime", "--file", file.path, out: File::NULL)
  abort "Could not store the Auth Meta secret; stop the cutover." unless transferred
end
puts "Meta secret transferred."
RUBY
```

The CLI exports into a temporary file readable only by its owner, imports that file, and removes it on completion or failure. The secret never appears in command arguments or terminal output. Keep the original secret in place until the cutover is verified. If the source secret is missing, stop and obtain the correct environment's app secret from its Meta application before continuing.

## Reset the old API schema once

This step deletes the selected API database's existing data and applies its fresh v1 baseline. It is deliberately outside automatic deployment.

Load `DATABASE_OWNER_DIRECT_URL` securely from the selected environment's API deployment secret profile into the current process. Confirm the provider console, database name `cataqui`, and owner role `db_owner` without printing the URL or password. Ensure no application is writing to that database during reset.

```sh
pnpm --filter @cataqui/api exec prisma migrate reset --force
```

Run this once for each existing environment being cut over. Never reset the Neon project or branch: Auth shares that compute and branch. Never use a runtime or pooled URL for reset or migration. A newly provisioned empty `auth` database needs its normal migration deployment, not a reset.

Do not flush the API Redis database: it also owns rate limits. Old authentication entries can expire naturally; the new applications do not read them. Auth starts with its dedicated Redis database.

## Deliver applications

Dispatch the intended revision with all applications selected:

```sh
gh workflow run deploy.yml --ref staging -f scope=all
```

Use `--ref main` for production. Approve only the intended environment and commit. The workflow provisions infrastructure before migrations, validates both application migration sets on expiring Neon branches, and applies them before application delivery. Auth is delivered before Maps and API; any required Mapshot release completes before Maps.

Do not bypass a failing migration validation or a failing health check. The first Auth deployment has no previous Worker version to restore automatically.

## Switch Meta and clients

After Auth is healthy, change the selected Meta application's WhatsApp callback URL:

| Environment | Callback |
| --- | --- |
| Staging | `https://staging.auth.cataqui.com/webhooks/whatsapp` |
| Production | `https://auth.cataqui.com/webhooks/whatsapp` |

Use the selected environment's `WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN` from `/generated/auth/runtime` when Meta verifies the callback. Keep the messages subscription enabled and the configured phone-number ID matched to the environment.

Clients must use Auth for login and session operations, and send the same opaque bearer access token to API and Maps. After connecting WhatsApp and collecting onboarding input, call `POST /v1/profiles` with `name` and `initialContacts`. The authenticated account determines the profile ID. Update current-profile reads to `/v1/profiles/me`, with contacts at `/v1/profiles/me/contacts` and job management at `/v1/profiles/me/jobs` and `/v1/profiles/me/jobs/:jobId`; the singular `/v1/profile` routes are removed. Job creation requires a profile and returns `409 PROFILE_REQUIRED` until onboarding creates one. Backend capability is ready in this release; the mobile onboarding changes must be delivered separately. Endpoint contracts live in Auth OpenAPI and API Swagger.

## Verify the cutover

- Auth readiness returns 200 and liveness returns 204. API and Maps health checks succeed.
- Complete a signed WhatsApp login, exchange its intent, read the current account/session, refresh the session, and confirm logout invalidates its access token. Confirm a replay outside the supported refresh recovery window is rejected.
- Feed access without a bearer token returns 401. A valid account can browse before it creates a profile; job creation then reports `PROFILE_REQUIRED`.
- Create a profile with contacts: the first request returns 201, an identical normalized retry returns 200, and a different creation payload returns 409. Read back the profile and contacts, then create and retrieve a job.
- Maps accepts that same access token. Existing signed static-map URLs still work without a bearer token.
- A failed Auth dependency produces a sanitized availability error rather than authenticating the caller.

## Clean up after the verified cutover

Complete this checklist separately for staging and production, only after the checks above pass and callbacks and clients use Auth successfully. Keep the old credentials and Worker until those consumers have switched. Record the environment, deployed commit, operator, and completion date for each cleanup; an incomplete cleanup remains a cutover follow-up.

- [ ] Remove the obsolete `cataqui-webhooks-<environment>` Worker and its old custom domain in Cloudflare. Confirm the selected environment before deletion. No application in this revision calls it.
- [ ] In the selected Infisical environment, delete only `AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL` and `MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64` from `/generated/api/runtime`. Preserve `/generated/api/runtime` and its current API secrets. Auth's replacement with the same name lives in `/generated/auth/runtime` and must remain.
- [ ] Delete the old `WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN` and copied `META_APP_SECRET` entries from `/generated/webhooks/runtime`. First confirm Meta uses the Auth callback and verification token and that signed webhook delivery succeeds. Preserve both entries in `/generated/auth/runtime`; removing the old Meta secret copy does not mean rotating or revoking the Meta application's secret.
- [ ] Revoke the obsolete Cloudflare API token named `cataqui-webhooks-workers-deployment-<environment>`, then delete its `CLOUDFLARE_API_TOKEN` copy from `/generated/webhooks/deployment`. Confirm no deployment still uses it. Preserve all current application and infrastructure tokens.
- [ ] Review any remaining entries in `/generated/webhooks/runtime` and `/generated/webhooks/deployment` for active consumers. Resolve any remaining credential ownership before deleting those entries, then remove the empty runtime, deployment, and parent `/generated/webhooks` folders. Do not remove folders or credentials belonging to current applications.
- [ ] Confirm the retired Worker/domain and deployment token, obsolete secret entries, and Webhooks folders are absent, and repeat the Auth, API, Maps, and signed WhatsApp login checks above. If cleanup fails, record the exact remaining resource without secret values and keep the follow-up open.

The `removed` blocks in `infrastructure/opentofu/roots/auth-secrets/removed.tf` and `infrastructure/opentofu/roots/infisical-generated-folders/removed.tf` use `destroy = false`: infrastructure reconciliation forgets the old resources but leaves them in Infisical. It does not perform the cleanup above. Once a resource has been forgotten, changing the block to `destroy = true` cannot delete it; perform the explicit Infisical cleanup instead.

Keep both files until successful infrastructure applies in **both staging and production** have removed every listed legacy address from their respective root states. Check resource addresses only; do not print full state or secret values. The blocks may then remain as migration history or be removed in a follow-up change after the per-environment cleanup is recorded. Deleting the files alone never deletes the retained secrets or folders.

## Failure and recovery

If infrastructure fails, stop before reset or application delivery and repair that failed root. If migrations or health checks fail, keep Meta and client switching pending and fix the candidate revision.

The database reset is destructive. An older Worker or API version cannot restore the discarded schema or data. After reset, recover with a corrected build compatible with these v1 schemas. Returning to the previous release requires a coordinated pre-cutover database backup and its matching code; ordinary Worker version rollback is insufficient. Later deployments must keep their database migrations compatible with whatever rollback they require.

Escalate unresolved provider, state, or secret-access failures to the maintainer responsible for that environment. Keep credentials and full state/plan contents out of incident logs.
