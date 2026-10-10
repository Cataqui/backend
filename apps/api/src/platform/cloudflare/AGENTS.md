# Cloudflare API Boundary Instructions

These instructions apply to the API application's Cloudflare routing Worker and container boundary and supplement the repository root and API instructions.

## Ownership

- The API Worker forwards public HTTP requests to API containers, consumes Queue deliveries, and exposes narrowly scoped named entrypoints for private Service Binding calls. It must not duplicate NestJS business logic.
- The API container owns NestJS business behavior. Public container requests must never expose `/internal`; only API Worker Queue delivery and named entrypoints may reach that prefix through the container binding.
- The API Worker may access generated Worker bindings. NestJS modules must not import the Worker environment or access bindings directly.

## Inbound and Queue Delivery

- Consume the public entrypoints of `@cataqui/api-internal-ingress`; do not deep-import or duplicate its receiver, Queue, schema, path, or protocol declarations.
- Route every registered receiver generically. Do not add receiver-specific branches to the Worker transport.
- Direct calls use a named `WorkerEntrypoint` RPC method. Queued work uses the Queue router's batching, acknowledgement, retry, and dead-letter behavior.
- NestJS receivers use `@InboundController()` and `@InboundReceiver(...)` and the package's authoritative Zod schema directly.
- Application business logic never enters the inbound package. The receiving controller calls the owning NestJS service through dependency injection.

## Outbound Delivery

- The Worker manifest owns outbound virtual hosts and each Worker's explicitly allowed methods, input/result schemas, and binding invocations.
- Application code calls `workerCall({ worker, method, input })`. Derive the input and return types from the selected Worker and method; keep transport hostnames out of feature code. Do not add raw fetches to virtual hosts or one-line wrappers.
- Validate the call envelope, selected method input, and binding result. Dispatch only the registered method callback; never use a caller-supplied string to invoke arbitrary binding properties.
- Execution callbacks receive the API Worker environment type. Do not forward all Worker bindings into the container.

## Configuration and Verification

- Keep the API routing Worker and API container in this application because they share one deployment boundary.
- Generate the API Worker environment from this application's Wrangler configuration and preserve the portable environment projection used by container code.
- Test public routing, the internal-prefix rejection, typed direct calls, Queue delivery outcomes, outbound routing, generated types, and Wrangler configuration changes.
