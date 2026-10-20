# AGENTS.md — Cataquí Applications

## Scope and Ownership

These instructions apply to every application under `apps/` and supplement the repository-root instructions. Apply the more specific instructions in each application's directory as well.

`apps/` owns Cataquí's backend applications and their application-specific code, configuration, dependencies, tests, and documentation.

- `api/` owns the core NestJS API and orchestration of Cataquí product behavior, including jobs and the feed, together with its Prisma schema, migrations, routing Worker, container, and image.
- `mapshot/` owns static map image generation, source data and storage, its Node.js containers and private Worker/controller, and its independent build, tests, and deployment.
- `workers/` contains independently deployable Cloudflare Workers for services that can operate outside the core API. Each Worker owns its own runtime and external integrations.
- `workers/auth/` owns authentication and its own persistence. Core product profiles and contacts remain in API.

## Private RPC Entrypoints

- Use named Worker entrypoints for private Service Binding APIs. Name an entrypoint for the application or domain capability it exposes, rather than its first operation.
- Reuse an entrypoint for additional explicit, typed methods when its callers should have the same access to those operations. Do not create an entrypoint per method or feature by default.
- Split entrypoints when callers need different permissions or restricted capabilities, such as administrative access versus ordinary application access. Adding a public RPC method expands the capabilities of every caller bound to that entrypoint; review that access when extending it.
- Keep entrypoints thin: validate inputs and delegate to the owning services. Keep business behavior in feature services and keep public HTTP routes separate from private RPC APIs.
- Add operations only for current requirements. A general entrypoint name does not justify exposing every internal method or introducing an untyped catch-all dispatcher.

## Documentation

- Keep READMEs focused on general information needed to understand and operate an application: purpose, ownership, architecture, setup, local development, configuration, and operational guidance.
- Document endpoint and request-specific details in Swagger/OpenAPI descriptions and schema metadata, alongside the owning routes and authoritative schemas. This includes parameters, request and response fields, supported values, defaults, validation limits, errors, and request examples.
- Do not turn READMEs into endpoint references or duplicate API contracts there. Link to the application's Swagger/OpenAPI documentation instead, and explain how to access it locally when applicable.
- Update the owning Swagger/OpenAPI documentation when endpoint behavior changes so consumers can rely on it as the API reference.

## Request Validation

- Whenever caller-supplied input fails validation, explain what is wrong and identify the affected field or request location when possible. Collect all detected field violations with a path and a diagnostic explaining the applicable requirement.
- Document validation errors in Swagger/OpenAPI, including their structured response and examples. Diagnostic messages are for developers; client applications own localized UI copy.
- Expose only owned validation details. Do not return raw validator objects, submitted values, secrets, or implementation internals.
- Keep internal and configuration validation failures sanitized as internal errors; do not expose them as caller-input violations.
