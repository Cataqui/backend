# Next deployment: AI Worker and app gateways

Prepared on 2026-10-24. These are repository changes only: no infrastructure was applied, no gateways were replaced, and no Worker was deployed during this work.

Use the [deployment runbook](docs/deployment.md) for ordinary promotion, failed-job retries, state locks, and environment prerequisites. This checklist covers the pending AI rollout and gateway cutover; remove it after both environments are verified.

## Before releasing

- Run the repository gate with Node.js 24, the pinned pnpm, Ruby/Bundler, OpenTofu, and a running Docker daemon. Local checks previously stopped at Mapshot because Docker was unavailable. Resolve all CI failures before promotion.
- Confirm the existing staging and production GitHub environments have their approved Infisical OIDC identity and provider credentials. No new OIDC identity or manually supplied AI runtime key is needed. Normal infrastructure reconciliation creates the AI deployment folders and token.
- Confirm Workers Paid access or prepaid Gateway credits before exercising `@cf/zai-org/glm-5.2`. Check the current [model requirements](https://developers.cloudflare.com/workers-ai/models/glm-5.2/) and [account/model rate limits](https://developers.cloudflare.com/workers-ai/platform/limits/). Paid-model limits apply across the Cloudflare account for that model, independently of the per-account application limiter.
- Auth must already expose `AuthEntrypoint.resolveSession` in the matching environment before AI is published. A combined release deploys Auth before AI, Maps, and API; Auth changes select AI automatically. An AI-only release uses the existing Auth deployment and remains independent of Maps and Mapshot.
- Review the environment-specific gateway plan privately. Expect removal of the old feature-specific gateway and creation of exactly the API and AI Worker gateways listed below. No state move, import, compatibility alias, or preservation of old gateway history is intended.
- Allow a brief interruption of API AI operations between gateway replacement and deployment of the matching API revision. This is an intentional pre-launch breaking change.

## 1. Release the shared zone policy first

The `cataqui.com` zone policy is production-owned, including protections for staging hostnames. Before merging the AI deployment configuration into `staging`, release the AI hostname exemption and its matching zone-policy test changes separately as an infrastructure-only change. Promote that prerequisite through the existing branch gates, then reconcile production infrastructure:

```sh
gh workflow run deploy.yml --ref main -f scope=infrastructure
```

Wait for success and confirm the browser-only challenge exemption includes both `ai.cataqui.com` and `staging.ai.cataqui.com`. Keep managed WAF and scanner protection enabled. Do not give a staging job production credentials or create a second staging state for the global zone.

## 2. Release the remaining changes to staging

Merge the remaining AI Worker, deployment, credential, and gateway changes into `staging`. Its normal CI/deployment run reconciles infrastructure before publishing applications. If an explicit rerun is needed:

```sh
gh workflow run deploy.yml --ref staging -f scope=all
```

Require the following before production promotion:

- The gateway root owns `cataqui-api-staging` and `cataqui-ai-worker-staging`, each with its own $5 budget over a sliding 30-day window.
- API uses `AI_GATEWAY_ID=cataqui-api-staging`; its existing `AI_GATEWAY_API_TOKEN` remains delivered through the API runtime profile. The API migration probe and Container receive the new setting.
- The AI Worker deployment profile contains only its deployment credential. The Worker exposes native `AI`, `AUTH`, and `NAME_MEANING_RATE_LIMITER` bindings and `AI_GATEWAY_ID=cataqui-ai-worker-staging`. Inference explicitly selects this gateway; Cloudflare authenticates binding calls, with no runtime token or Infisical runtime profile.
- Name-meaning requests follow the owning Gateway logging configuration, which enables logs. Verify authorized inference calls appear in that gateway with their prompt and response for debugging.
- `https://staging.ai.cataqui.com/v1/health` returns HTTP 204, a request ID, and `Cache-Control: no-store`. `/openapi.json` returns the structured 404 response.
- After rollout is authorized, use a staging account's opaque bearer token for `POST https://staging.ai.cataqui.com/v1/inference/name-meaning`, with `Content-Type: application/json`, `Accept-Language: pt-BR`, and body `{ "name": "Sophia Silva" }`. This verification makes a billable model call. Supply credentials privately, never in logged commands. Expect HTTP 200 and the standard envelope with `data.meaning` meaning wisdom in Brazilian Portuguese, ignoring Silva. The app may send `Accept-Language: pt-br`; it is canonicalized to `pt-BR`, then expanded to a language name inside the prompt. Only language, script and region enter model instructions; unrelated locale variants/private-use/formatting extensions are omitted. Verify a script-specific app locale such as `sr-Cyrl-RS` and confirm an appended instruction in a name cannot change the operation or requested language. Repeat with another app locale and a compound input such as João Pedro dos Santos: the meaning should describe João only. Unknown or genuinely disputed etymologies should return `null`; model mistakes remain possible. Verify the call uses the AI Worker gateway. An unauthenticated call returns 401 without inference; health stays public and makes no Auth or AI calls.
- The account limiter allows 10 valid authenticated requests per 60 seconds; rejection is 429 with `Retry-After: 60`. Cloudflare's native limiter is locally enforced and eventually consistent, not an exact global billing quota. Invalid input/language is 400, bodies above 4 KiB are 413, malformed or truncated model output is 502, and Auth/inference outages are 503. Do not accept an outage as an unknown-name `null` result.
- The API deployment's health checks pass. Using a staging account, exercise the existing job-draft AI derivation flow and verify its request appears in the API gateway, without logging credentials or personal input.

Worker Custom Domains own the AI DNS records and certificates. Do not add competing DNS records or enable workers.dev/preview URLs to work around a domain failure. Correct the reported domain or certificate problem and retry.

## 3. Promote to production

After staging succeeds, use the existing staging-to-main release PR and merge-commit procedure. Production reconciliation replaces its old gateway before deploying the API revision that uses the new configuration.

Verify `cataqui-api-production` and `cataqui-ai-worker-production`, each with an independent $50 sliding 30-day budget. Confirm API health and existing AI derivation through the API gateway, then verify HTTP 204 from `https://ai.cataqui.com/v1/health`. Confirm the AI Worker binds production Auth and selects `AI_GATEWAY_ID=cataqui-ai-worker-production`. Repeat the authorized endpoint verification above against the production hostname with a production session. Health remains the deployment gate and does not prove model entitlement, gateway availability, or inference accuracy.

The combined configured budgets are $10 in staging and $100 in production. Spending enforcement is eventually consistent and concurrent requests can briefly exceed the configured amount; these are not strict billing caps. See [Cloudflare spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/).

## Failures and recovery

- Stop promotion when infrastructure, health checks, or inference verification fails. Correct the reported failure and retry the matching environment's run.
- A first AI Worker deployment has no previous version to restore. Correct and retry its candidate.
- Worker rollback does not reverse gateway replacement. An automatic restoration to a pre-cutover API version still references the removed gateway and cannot restore AI operations. Deploy a corrected revision using `AI_GATEWAY_ID` and the new API gateway; do not rely on pre-cutover versions for recovery.
- Update existing local API `.env` files to use `AI_GATEWAY_ID`; the example uses `cataqui-api-development`. Development gateways are not provisioned by these staging/production roots. Local inference requires a deliberately selected, provisioned gateway and credentials for that environment.
- The AI Worker declares `cataqui-ai-worker-development` for local development. Before exercising local inference, authenticate the Cloudflare CLI, run the local Auth Worker, and provision that gateway explicitly. Its native binding does not require a manually supplied runtime token; health and error-route checks make no AI calls.
- Keep tokens, connection URLs, state files, and saved plans private. Do not rerun privileged bootstrap merely to retry an application deployment.
