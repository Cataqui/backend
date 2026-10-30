# AGENTS.md — Cataquí Cloudflare Workers

## Scope

These instructions apply to every standalone Worker under this directory and supplement the repository root. This directory is an organizational and instruction boundary, not a package or a separate skills scope; all skills remain at the repository root.

## Runtime and Deployment Boundaries

- Every child directory is an independently buildable, testable, and deployable application with its own `package.json`, Cloudflare configuration, bindings, environment types, tests, and release lifecycle.
- Keep each Worker's code and contracts inside its owning application. Never import another application's code, types, schemas, or RPC definitions, including through public package exports. The root configuration-only Worker-definition exception applies to native Cloudflare Service Binding inference. Share capabilities used by multiple applications through a narrowly owned package under `packages/` and its public entrypoint.
- Keep NestJS product behavior and product database access in API. Auth owns its separate authentication database, Prisma schema and migrations. Other Workers may authenticate ingress, enforce an edge concern, normalize provider input, call a typed internal boundary, or orchestrate a Worker-native binding.
- Use a named Worker RPC entrypoint for immediate private calls and a Queue for durable asynchronous delivery. Never synthesize internal URLs or shared-secret headers for Worker-to-Worker calls.
- Provider-owned payloads retain their provider field names at ingress. Normalize accepted data to minimal camelCase Cataquí contracts before it crosses an owned boundary.
- Keep generated Cloudflare environment declarations local to their Worker. Derive application-scoped environment aliases from the owning configuration and use native Worker-definition references so binding methods derive from target entrypoints. Include only the owning Worker’s generated global declarations in each TypeScript context. Do not duplicate method signatures in handwritten binding interfaces; authored integration types stay local, and binding calls explicitly map fields between independently owned contracts.

## Hono Structure

- Keep the application entrypoint in `src/app.ts`; it owns global middleware, route mounting, not-found behavior, and the global error boundary.
- Put feature folders directly under `src`; do not add a `modules` wrapper.
- Keep `*.routes.ts` focused on HTTP input, service calls, and successful responses.
- Keep orchestration and business decisions in `*.service.ts`, independent of Hono `Context`.
- Use `*.repository.ts` only for real external boundaries such as providers, storage, Queues, or another Worker.
- Keep concrete errors and provider adapters beside their owning feature. Do not create generic helper directories for single-feature logic.
- Authenticate signed webhooks against the exact raw request bytes before parsing.

## Scheduled Operations

- Keep scheduled dispatch in `src/scheduled.ts`, wired through the default Worker handler in `src/app.ts`. Delegate business behavior to the owning services.
- Define named schedules in `src/schedules.ts` using an application-owned enum or enum-style object. Share these declarations between `cloudflare.config.ts` and runtime dispatch rather than duplicating cron expressions.
- Select operations from the triggering schedule and reject unknown schedules.
- Keep invocation resources scoped and reliably released, and propagate operation failures to the scheduled invocation.

## Public HTTP Documentation

- Keep complete request and response examples in the feature's OpenAPI metadata, alongside the schema resolver. Use a single `example` for one scenario and named `examples` with typed `value` payloads for distinct scenarios; never set both on the same media type. Register documentation metadata after validators when supplying request-body examples: the generator replaces media-type metadata in middleware order. Preserve authentication and validation order. Let validators discover request schemas instead of repeating their fields. Schema metadata is reserved for reusable value examples, not operation-specific envelopes.
- Public HTTP describes the documented transport surface, not permission to publish documentation publicly. Follow the repository's private-documentation policy; serve generated documents only in explicit local development mode.
- Use `hono-openapi` to generate public HTTP documentation from the registered Hono application. Define paths, methods, and mount prefixes only in routing code; never maintain a separate handwritten `paths` document. Public HTTP includes authenticated client routes and provider webhooks, but excludes private Service Binding RPC.
- Keep operation descriptions, responses, security requirements, and examples in feature-owned `*.openapi.ts` files, and attach their exported `describeRoute` middleware in `*.routes.ts`. Keep authoritative input and output schemas in their dedicated `*.schema.ts` files; reuse them for validation and documentation rather than repeating field definitions.
- Use `validator` from `hono-openapi` for ordinary request validation so request schemas are discovered automatically. When a transport needs custom parsing, reuse its schema through `resolver` in route metadata or the library's custom-middleware metadata extension, and preserve the owning error contract. Signed webhook bodies must still be authenticated before parsing or schema validation.
- Keep only document-wide settings, such as title, version, servers, and security schemes, in the application-level OpenAPI configuration. Serve the generated document through `openAPIRouteHandler`. Describe responses explicitly using the authoritative output schemas with `resolver`; generation does not infer response schemas from handler return types or enforce runtime output validation.
- Preserve nonstandard HTTP methods and implicit transport behavior in the generated contract, including `QUERY` and static-image `HEAD`. Verify the generated document through the application's HTTP endpoint when changing route registration or schema integration.

## Cloudflare Configuration and Verification

- Keep runtime bindings, secrets declarations, routes, and complete mode-specific settings in the owning `cloudflare.config.ts`. Keep compiler and bundler settings in the tool-required configuration.
- Regenerate and check environment declarations after changing a binding or mode.
- Keep development, staging, and production resources explicitly separated. Do not loosen a route, binding, secret, rate limit, or compatibility setting to make local development easier.
- Each Worker must pass its own typecheck, tests, four-metric 90% coverage gate, build dry run, and generated-type check.
- Keep Hono and Worker-specific skills in the repository-root registry and root skill installation.
