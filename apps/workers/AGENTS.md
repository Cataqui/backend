# AGENTS.md — Cataquí Cloudflare Workers

## Scope

These instructions apply to every standalone Worker under this directory and supplement the repository root. This directory is an organizational and instruction boundary, not a package or a separate skills scope; all skills remain at the repository root.

## Runtime and Deployment Boundaries

- Every child directory is an independently buildable, testable, and deployable application with its own `package.json`, Wrangler configuration, bindings, environment types, tests, and release lifecycle.
- Workers must not import another application. Share stable behavior only through a narrowly owned package and its public entrypoint.
- Keep NestJS business behavior and Prisma access in the API application. A Worker may authenticate ingress, enforce an edge concern, normalize provider input, call a typed internal boundary, or orchestrate a Worker-native binding.
- Use a named Worker RPC entrypoint for immediate private calls and a Queue for durable asynchronous delivery. Never synthesize internal URLs or shared-secret headers for Worker-to-Worker calls.
- Provider-owned payloads retain their provider field names at ingress. Normalize accepted data to minimal camelCase Cataquí contracts before it crosses an owned boundary.
- Keep generated Wrangler environment declarations local to their Worker. Generate them only from the owning Wrangler configuration. Refine a service binding through a shared package interface rather than importing the target application implementation.

## Hono Structure

- Keep the application entrypoint in `src/app.ts`; it owns global middleware, route mounting, not-found behavior, and the global error boundary.
- Put feature folders directly under `src`; do not add a `modules` wrapper.
- Keep `*.routes.ts` focused on HTTP input, service calls, and successful responses.
- Keep orchestration and business decisions in `*.service.ts`, independent of Hono `Context`.
- Use `*.repository.ts` only for real external boundaries such as providers, storage, Queues, or another Worker.
- Keep concrete errors and provider adapters beside their owning feature. Do not create generic helper directories for single-feature logic.
- Authenticate signed webhooks against the exact raw request bytes before parsing.

## Wrangler and Verification

- Keep `main`, `tsconfig`, bindings, secrets declarations, routes, and per-environment settings in the owning Worker configuration.
- Keep all top-level Wrangler settings before the `env` block, with `env` as the final top-level property. Never place root configuration after named environments; keep environment-specific overrides inside their respective `env` entries.
- Regenerate and check environment declarations after changing a Wrangler binding or environment.
- Keep development, staging, and production resources explicitly separated. Do not loosen a route, binding, secret, rate limit, or compatibility setting to make local development easier.
- Each Worker must pass its own typecheck, tests, four-metric 90% coverage gate, build dry run, and generated-type check.
- Keep Hono and Worker-specific skills in the repository-root registry and root skill installation.
