# NestJS Module Instructions

These instructions apply to every feature module in this scope and supplement the repository-root instructions.

## Authentication Boundaries

- API controller routes require authentication by default. Mark public handlers or controllers with `@Public()` metadata; the global authentication guard owns that decision. Swagger registration and CORS preflight are owned by their framework integrations.
- The API Worker resolves opaque access tokens through Auth and supplies the trusted session context. NestJS consumes that context through its global guard and never reads Auth storage.
- Use `@RateLimit(...)` for selected per-account limits after global authentication.
- Profiles and contacts belong to API. Profile requirements are opt-in through `@ProfileRequired()` on a handler or controller. The global profile guard runs after authentication and checks the database without Redis. Business services keep operation-specific ownership rules; they do not repeat the ingress profile-existence check.

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
