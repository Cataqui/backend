# NestJS Module Instructions

These instructions apply to every feature module in this scope and supplement the repository-root instructions.

## Authentication Boundaries

- Browsing remains public. Require authentication only on routes that need an account; never apply the access-token guard globally.
- Use `@AccessTokenRequired()` for access-token-protected NestJS routes. A refresh token is a separate session credential and does not require a still-valid access token to refresh or log out.
- Use `@RateLimit(...)` by itself for an authenticated per-user rate limit; it already requires the access token before enforcing the Redis limit.
- Keep access and refresh tokens opaque to clients, store only their hashes, and keep refresh-token signing keys in secret delivery. Do not replace the current session design with JWTs or an auth framework without an explicit architecture decision.
- Provider authentication proves that a webhook came from the provider; it does not authenticate a Cataquí user until the application validates the NOTP intent and identity.

## API Documentation Scope

- Keep operation summaries and descriptions focused on the consumer-visible purpose, input behavior, and outcome.
- Do not explain internal implementation details such as persistence order, AI derivation, Queue publication, cache behavior, service coordination, or other backend workflow steps. Those details change independently of the API contract and make documentation stale.
- Do not repeat operational policies such as rate-limit values in the operation description when they are already documented by the relevant response status and headers.
- Document behavior a consumer must act on—such as omitted fields remaining unchanged, asynchronous results not being immediately available, or an idempotent retry outcome—without explaining how the backend implements it.

Avoid:

```text
Updates the supplied draft fields and leaves omitted fields unchanged. A description change clears stale derived metadata, saves the new description, and then schedules fresh metadata derivation. Each authenticated user may submit up to 60 draft updates per hour.
```

Prefer:

```text
Updates the supplied draft fields and leaves omitted fields unchanged.
```

## Container Controller File Names

- Name every controller reached through the API container inbound boundary with the `*.inbound.controller.ts` filename pattern and its colocated test `*.inbound.controller.spec.ts`, regardless of whether the Worker received the work synchronously or from a Queue.
- Use `@InboundController()` and `@InboundReceiver(...)` for inbound controllers. Keep their request schema explicit on `@Body({ schema })` and infer the parameter type directly from that Zod schema.
- Inbound controllers may directly coordinate a small, single-use delivery workflow across existing application and provider services. Keep database access, Redis operations, reusable domain rules, and substantial provider behavior in their owning services or repositories.
- Do not create a service whose only purpose is to mirror one inbound receiver. Extract the workflow when it becomes substantial, gains another caller, or represents independently meaningful domain behavior.
- Keep public or externally called controllers on the standard `*.controller.ts` pattern.
