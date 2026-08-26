# AGENTS.md — Webhooks Worker

## 1. Runtime Behavior Over Test Workarounds

Do not change production code or introduce a compatibility workaround merely because the current test runtime cannot execute a Cloudflare Workers API.

The deployed Cloudflare Workers runtime is authoritative for this subproject. When an API is supported by Workers but unavailable in Node.js, Vitest, or another local test environment:

- do not replace it with a Node-specific alternative;
- do not add a package, polyfill, adapter, fallback, or production indirection solely for tests;
- do not duplicate the runtime primitive's implementation inside tests;
- leave that primitive without direct unit coverage when it cannot be exercised in its real runtime;
- test the surrounding application behavior at a legitimate boundary without pretending to test the unavailable primitive.

Prefer a real `workerd` integration test only when the behavior warrants the additional infrastructure. Test limitations never override correct production behavior.

## 2. Cloudflare-Native APIs First

Before implementing custom Worker logic, always research whether Cloudflare Workers or the web-platform runtime already provides the required capability.

- Check current official Cloudflare Workers documentation, runtime compatibility information, and changelog before writing a custom implementation.
- Prefer a supported Cloudflare or standard web-platform API over handwritten encoding, cryptography, request handling, streaming, routing, limits, or compatibility logic.
- Confirm that the configured Worker compatibility date supports the native API before adopting it.
- Do not add a dependency, polyfill, Node-specific alternative, or custom implementation when the deployed Workers runtime already provides the capability.
- Keep custom logic only when no suitable native capability exists or when the domain behavior is specific to Cataquí.

## Worker Purpose

This Hono Worker is Cataquí's public ingress for provider webhooks. It authenticates provider requests at the edge, rejects irrelevant or unsafe traffic, and normalizes accepted events into owned contracts.

The Worker must remain an ingress boundary. It must not create users, mutate durable application state, execute payment or authentication business rules, or send provider replies. Latency-sensitive delivery may call a narrowly scoped named API Worker entrypoint through a private Service Binding. Use a Queue only when the workflow explicitly requires buffering or durable asynchronous retries.

Each provider owns its public webhook route, signature boundary, provider payload schemas, and provider-to-Cataquí parsing. Business modules such as NOTP remain route-free and operate only on normalized provider data. A provider route may invoke several business modules so one callback can support multiple use cases without provider behavior leaking into those modules. Do not scaffold a module before its integration is being implemented.

## Provider Boundaries

- Verify provider signatures against the exact raw request bytes before parsing the payload.
- Keep provider-owned payload field names unchanged at the provider boundary.
- Convert accepted events into a shared camelCase Cataquí contract before delivery.
- Never deliver raw provider bodies, plaintext NOTP codes, unrelated message text, or unnecessary provider data beyond this boundary.
- Keep provider-specific parsing, identifiers, secrets, and validation inside the owning provider module.
- Share a utility only when its contract genuinely applies across provider modules.

## Security and Logging

- Use Cloudflare Workers runtime APIs directly when they provide the required security primitive.
- Keep secrets in Worker bindings and never hardcode or log them.
- Log only structured event names, counts, response statuses, and safe operational measurements.
- Never log request bodies, signatures, NOTP codes, access tokens, sender identifiers, phone numbers, or secrets.
- Await direct application delivery before acknowledging a latency-sensitive provider event. Let delivery failures reach the global error boundary so the provider receives a retryable server error.

## Error Boundaries

- Let unexpected request-stream, runtime, cryptographic, binding, and internal failures propagate to Hono's global error boundary.
- Do not add a local `try/catch` merely to log another event and return the same generic `500` response as the global boundary.
- Add a local `try/catch` only when it performs meaningful recovery or cleanup, translates an expected provider failure into a deliberately different response, or preserves required retry or acknowledgement semantics.
- Do not misclassify programming errors, previously consumed request bodies, or runtime failures as ordinary provider input failures.

## Validation

Run focused tests for the changed module, then validate the owning Worker with:

```bash
pnpm test:webhooks
pnpm --filter @cataqui/webhooks-worker test:cov
pnpm --filter @cataqui/webhooks-worker typecheck
pnpm --filter @cataqui/webhooks-worker build
pnpm lint:check
```

Before handoff, expand through affected consumers and the repository-level gate required by the root instructions.

Use `pnpm --filter @cataqui/webhooks-worker cf:dev` for isolated Webhooks Worker behavior when a runtime-specific API cannot execute under the standard Vitest environment. When behavior must cross the private `API_WORKER` Service Binding, make the configured API Worker target available; a direct NestJS process alone is not that boundary.
