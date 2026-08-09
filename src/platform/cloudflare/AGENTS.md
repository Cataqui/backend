# Cloudflare Platform Instructions

These instructions apply to the Cloudflare platform scope containing this file and supplement the repository-root instructions.

## Cloudflare Runtime Boundaries

Cloudflare code has four explicit owners: the API Worker, the Webhooks Worker, the API container boundary, and shared Queue infrastructure.

- The API Worker forwards public HTTP requests to API containers and consumes Queue deliveries. It must not duplicate NestJS business logic.
- The Webhooks Worker is an ingress-only Hono application. It authenticates provider requests against the exact raw bytes before parsing, filters irrelevant events, normalizes accepted events into owned Queue contracts, and enqueues them. It must not create users, mutate durable application state, call API containers synchronously, or send provider replies.
- The API container owns NestJS business behavior. Public container requests must never expose `/internal` routes; Queue deliveries reach those routes only through the container binding.
- The Queue manifest is the authoritative source for Queue base names, message schemas, and derived consumer paths. Provider and feature code must use that shared contract instead of repeating Queue routes or message types.
- The API container outbound manifest is the single source for outbound virtual hosts, body schemas, and execution. Declare each outbound exactly once as one manifest entry; do not create a second contract, projection, or feature-specific publisher. Execution callbacks receive the API Worker environment type, and application code calls `outboundCall({ host, body })` directly from the same manifest.
- Keep Wrangler's generated ambient environment declaration inside its owning Worker. `pnpm cf:types` automatically derives the importable API Worker environment used by shared Cloudflare infrastructure; never maintain that environment interface manually. NestJS business modules must not read Worker bindings directly.
- Keep manifests declarative and locally extensible. A new Queue or outbound call should be one additive manifest entry plus its owning business implementation and tests.
- Keep provider-owned payload schemas at the webhook boundary. Only normalized, minimal, camelCase Cataquí payloads may cross into shared Queues or NestJS.

## Local Multi-Worker Development

- Use `pnpm cf:dev` to exercise the complete local Webhooks Worker → Queue → API Worker/container path. It starts the Webhooks config first as Wrangler's HTTP-exposed primary Worker and the API config second as the Queue consumer, so both share one local Queue simulation.
- Use `pnpm cf:dev:webhooks` or `pnpm cf:dev:api` only when intentionally working on one Worker in isolation. Separate Wrangler processes do not prove the cross-Worker Queue path.
- Keep the repository development environment as the single local secret source. Wrangler commands that change their working directory must receive that root environment explicitly.
