# Cloudflare Platform Instructions

These instructions apply to the Cloudflare platform scope containing this file and supplement the repository-root instructions.

## Cloudflare Runtime Boundaries

Cloudflare code has four explicit owners: the API Worker, the Webhooks Worker, the API container boundary, and shared Queue infrastructure.

- The API Worker forwards public HTTP requests to API containers, consumes Queue deliveries, and exposes narrowly scoped named entrypoints for private Service Binding calls. It must not duplicate NestJS business logic.
- The Webhooks Worker is an ingress-only Hono application. It authenticates provider requests against the exact raw bytes before parsing, filters irrelevant events, and normalizes accepted events into owned contracts. Latency-sensitive workflows may call a named API Worker entrypoint through a private Service Binding; asynchronous workflows may publish to a Queue. It must not create users, mutate durable application state, or send provider replies.
- The API container owns NestJS business behavior. Public container requests must never expose `/internal` routes; only API Worker Queue delivery and named Service Binding entrypoints may reach them through the container binding.
- The Queue manifest is the authoritative source for Queue base names and their typed inbound-receiver mappings. The inbound manifest owns receiver body schemas and the shared internal path prefix so direct and queued delivery share one application boundary.
- The API container outbound manifest is the single source for outbound virtual hosts, body schemas, and execution. Declare each outbound exactly once as one manifest entry; do not create a second contract, projection, or feature-specific publisher. Execution callbacks receive the API Worker environment type, and application code calls `outboundCall({ host, body })` directly from the same manifest.
- The API container inbound manifest is the single source for direct-call receiver names, body schemas, and the shared internal path prefix. Calling Workers must use `inboundCall({ worker, receiver, body })`; the API Worker must route every registered receiver generically instead of adding receiver-specific branches.
- Direct Worker-to-Worker inbound calls must use a named `WorkerEntrypoint` RPC method through the Service Binding. Do not construct synthetic URLs or `Request` objects for typed internal commands; keep HTTP only for the real API Worker-to-container delivery.
- Mark every NestJS controller reached through the inbound boundary with `@InboundController()` and every receiving method with `@InboundReceiver(...)`, including work delivered by a Queue. Receiver methods keep using the manifest's authoritative Zod schema directly with `z.infer`; the decorators own only internal routing, versioning, envelope bypass, and Swagger exclusion.
- Keep Wrangler's generated ambient environment declaration inside its owning Worker. Generate a caller's Service Binding types with both the caller and target Worker configurations so RPC methods are inferred from the target entrypoint; never maintain that environment interface manually. NestJS business modules must not read Worker bindings directly.
- Keep manifests declarative and locally extensible. A new Queue, inbound call, or outbound call should be one additive manifest entry plus its owning business implementation and tests.
- Define manifests as objects keyed by their authoritative identifier, such as a Queue base name, inbound receiver, or outbound host. Derive supported-name unions with `keyof`; do not use arrays that repeat the identifier inside each entry.
- Keep provider-owned payload schemas at the webhook boundary. Only normalized, minimal, camelCase Cataquí payloads may cross into shared contracts, Queues, or NestJS.

## Local Multi-Worker Development

- Use `pnpm cf:dev` to exercise the complete local Webhooks Worker → Service Binding → API Worker/container path and shared Queue workflows. It starts the Webhooks config first as Wrangler's HTTP-exposed primary Worker and the API config second as its bound service and Queue consumer.
- Use `pnpm cf:dev:webhooks` or `pnpm cf:dev:api` only when intentionally working on one Worker in isolation. An isolated Webhooks Worker cannot prove direct application delivery because its API Worker Service Binding is disconnected.
- Keep the repository development environment as the single local secret source. Wrangler commands that change their working directory must receive that root environment explicitly.

## Hono Application Structure

- Keep each Hono application entrypoint in `app.ts`. The application entrypoint owns only global middleware, feature-route mounting, not-found behavior, and the global error boundary.
- Declare feature folders directly under the owning Worker. Do not add a `modules` wrapper directory.
- Keep `*.routes.ts` focused on HTTP concerns: parsing and validating request-owned input, calling the feature service, and returning successful responses. Let typed service errors reach the application's global error boundary for consistent response translation.
- Keep orchestration and business decisions in `*.service.ts`. Services must remain independent of Hono `Context` so they can be tested without constructing HTTP requests.
- Define one Worker-wide base error contract that the global error boundary can serialize without feature-specific branching. Keep concrete domain errors beside their owning feature and throw them directly from services.
- Use `*.repository.ts` only for real external boundaries such as provider HTTP APIs, storage, Queues, or another Worker. Routes must not call repositories or provider clients directly.
- Colocate provider-specific adapters and schemas inside the feature that owns their normalized output. Provider contracts must not leak into route responses or service callers.
- Share code across feature folders only when its contract genuinely applies to the whole Worker. Do not create generic helper folders for single-feature logic.
