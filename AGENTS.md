# AGENTS.md — Cataquí API

## 0. Mission

You are working on the **Cataquí Private User API**.

Cataquí is the real-time opportunity layer of the city: a hyperlocal feed for quick jobs, side hustles, informal work, and short-term tasks.

This repository powers user-facing actions such as:

- browsing opportunities
- creating job/task posts
- viewing post details
- contacting posters through WhatsApp
- reporting unsafe or low-quality posts
- managing lightweight user identity

This API is **not** the admin/moderation API. Admin workflows must live in a separate admin API or clearly isolated admin module if temporarily colocated.

The product must always feel:

- fast
- simple
- local
- trustworthy
- non-corporate

The core product promise is:

> Open Cataquí and immediately see real opportunities happening near you.

---

## 1. Product Context

### What Cataquí Is

Cataquí is like a modern Craigslist for LATAM, but focused only on short-term work and local opportunities.

It is not for full-time corporate jobs. It is for things like:

- unloading a truck
- working two days at a bar
- helping at an event
- being a waiter for a weekend
- helping with a move
- cleaning work
- promotions
- temporary store help
- local freelance tasks

### Who Cataquí Serves

Cataquí serves two sides:

#### Workers

People who need money fast and want to find something nearby without corporate hiring friction.

#### Posters

People, stores, venues, businesses, agencies, or individuals who need someone to work quickly.

### Golden Path

1. A person or business posts a quick job/task.
2. A worker opens the feed and discovers the opportunity.
3. The worker taps the WhatsApp CTA.
4. The conversation happens outside the platform.
5. If both sides agree, the worker does the job and gets paid.

### Product Philosophy

Never turn Cataquí into:

- LinkedIn
- enterprise HR software
- a staffing ERP
- a corporate recruiting platform
- a complex applicant tracking system

Always optimize for:

- low friction
- fast posting
- fast discovery
- local relevance
- trust and safety
- freshness
- simple UX
- feed quality

---

## 2. Technical Stack

### Runtime & Package Manager

- Runtime: **Node.js 24.x**
- Package manager: **pnpm**
- Language: **TypeScript 6**
- Framework: **NestJS**
- HTTP adapter: **Fastify adapter**
- ORM: **Prisma**
- Database: **PostgreSQL on Neon**
- Shared ephemeral state: **Upstash Redis**
- Edge and asynchronous infrastructure: **Cloudflare Workers, Containers, and Queues**
- File/media storage: **Cloudflare R2** or S3-compatible storage
- Test framework: **Vitest**

### Container Communication Model

Treat **inbound** and **outbound** as directions relative to the API container:

```txt
Public client → API Worker → API container       public HTTP request
Trusted Worker or Queue → inbound → API container
API container → outbound → Cloudflare binding or external destination
```

These names describe a trust and runtime boundary, not a business feature.

#### Public HTTP Requests

- Public clients call the API Worker, which selects an API container and forwards the request through the container's public request boundary.
- Public NestJS controllers expose versioned user-facing routes normally.
- Public requests must never reach `/internal` routes. The container boundary rejects the entire internal prefix before forwarding a request to NestJS.
- Do not use an inbound receiver merely to call another service inside the same NestJS process; use normal dependency injection for in-process calls.

#### Inbound Calls — Work Entering the Container

Use the inbound boundary when trusted Cloudflare infrastructure needs to invoke application behavior inside the API container.

- For a synchronous call from another Worker, call `inboundCall({ worker, receiver, body })`. The `worker` is the caller's private API Worker Service Binding, and the call uses the API Worker's named RPC entrypoint. Never construct a synthetic URL, public HTTP request, or shared-secret header for Worker-to-Worker delivery.
- For asynchronous work, publish to the Queue normally. The Queue manifest maps the Queue name to a typed `inboundReceiver`; the API Worker owns batching, acknowledgement, retry, and dead-letter behavior before delivering the validated message through the same inbound container boundary.
- The inbound manifest is the authoritative source for receiver names, input schemas, and the shared internal path prefix. A receiver name passed anywhere must be inferred from this manifest, never repeated as an unrelated string type.
- `@InboundReceiver("receiver-name")` owns the complete `internal/inbound/receiver-name` route. `@InboundController()` marks the controller boundary but does not contribute a route prefix.
- NestJS receives inbound work only through controllers marked with `@InboundController()` and methods marked with `@InboundReceiver(...)`. Their files use the `*.inbound.controller.ts` pattern.
- Inbound controllers may orchestrate application services, but Cloudflare Workers and manifests must not contain NestJS business logic.

#### Outbound Calls — Work Leaving the Container

Use the outbound boundary when NestJS code running inside the container needs a Cloudflare binding or another destination that only the API Worker runtime can access.

- Call `outboundCall({ host, body })` from NestJS. The host must be a typed key from the outbound manifest; never call a virtual outbound hostname with raw `fetch` from feature code.
- The outbound manifest is the single declaration for each virtual host, its body schema, and its `execute` implementation. The container intercepts that host and runs the implementation in the API Worker runtime, where generated Worker bindings are available.
- Do not import Worker environment bindings into NestJS modules, forward all Worker bindings into the container, or create feature-specific publisher wrappers around a one-line `outboundCall`.

#### Choosing the Direction

- User or public API request: use a normal public controller.
- Another Worker needs an immediate application result: use `inboundCall` through its Service Binding.
- Work must survive, retry, or run asynchronously: publish to a Queue mapped to an `inboundReceiver`.
- Container code needs to publish to a Queue or use another Worker-only binding: use `outboundCall`.
- Code is already inside the NestJS process: call the owning service directly through dependency injection.

### Package Manager Rules

Always use pnpm.

Allowed:

```bash
pnpm install
pnpm add <package>
pnpm add -D <package>
pnpm run <script>
pnpm test
pnpm <...>
```

Never use:

```bash
npm install
npm run
yarn
bun
```

Do not commit:

- `package-lock.json`
- `yarn.lock`
- `bun.lockb`
- `bun.lock`

The only accepted lockfile is:

- `pnpm-lock.yaml`

---

## 3. API Design Rules

### API Style

Use REST.

Do not use GraphQL unless explicitly requested.

All user-facing routes must be versioned:

```txt
/v1/...
```

### Wire Format

All owned API, Queue, and internal-service payloads must use `camelCase`, matching internal TypeScript code.

Provider-owned payloads keep the provider's exact field names at the integration boundary. For example, Meta webhook payloads remain `snake_case`, but the normalized Cataquí Queue message is `camelCase`.

Example:

```json
{
	"postId": "...",
	"createdAt": "...",
	"whatsappUrl": "..."
}
```

Internal:

```ts
postId;
createdAt;
whatsappUrl;
```

### API Contract Serialization

For API contracts:

- Keep one authoritative schema per schema file. Each `*.schema.ts` file must define and export exactly one top-level schema, and the file name must match that schema's domain name.
- Define the authoritative runtime contract with Zod.
- For request bodies, query parameters, and route parameters, attach the schema directly to the Nest decorator and use `z.infer<typeof InputSchema>` directly at the parameter or service boundary. Do not create an empty transport class or a type alias that only repeats the inferred schema type.
- Name every owned schema for incoming data `*InputSchema` and its file `*-input.schema.ts`, regardless of whether the value currently comes from an HTTP body, query string, route parameters, Queue message, or another boundary. Never encode transport-specific words such as `Request`, `Body`, `Query`, or `Params` in a reusable input schema name. Provider-owned payload contracts may retain the provider's terminology at the integration boundary.
- For outputs, return plain objects typed directly as `z.infer<typeof OutputSchema>`. Do not create output transport classes, constructor-only wrappers, or inferred output type aliases.
- Keep database-to-API conversion explicit. Put substantial or reused conversion in a focused `*-output.mapper.ts` file as a top-level named `to*Output` function; do not wrap it in a mapper class, object, or namespace. Keep trivial one-use mapping inline at the service boundary. Output conversion returns plain schema-inferred objects and must never return Prisma records directly.
- Attach input schemas directly to Nest decorators such as `@Body({ schema })`, `@Query({ schema })`, and `@Param({ schema })`.
- Use Nest's native `StandardSchemaValidationPipe`, `StandardSchemaSerializerInterceptor`, and `@SerializeOptions({ schema })` for request and response contracts.
- Generate Swagger schemas from the same Zod contract through Nest Swagger's Standard Schema support and `zod-openapi`; do not duplicate fields with manual property decorators.
- Do not use class identity or `instanceof` to distinguish response outcomes. Use discriminated unions or explicit internal result contracts.

### Contract Validation Boundary

Request Zod schemas must validate every rule that can be decided exclusively from the request itself. This includes field formats, conditional required fields, relationships between request fields, and other self-contained input invariants. Use Zod features such as `refine`, `superRefine`, and discriminated unions instead of repeating those checks in services.

Services validate rules that require shared or external context, including current database state, lifecycle state, another service, or a provider response. Do not move a rule into a service when the request schema has all the information needed to decide it. Output schemas only define and serialize the public contract; they do not contain business rules.

### Cursor Pagination

Infinite feeds must use cursor pagination, not offset pagination.

Good:

```txt
GET /v1/resources?cursor=...&limit=20
```

Avoid:

```txt
GET /v1/resources?page=10
```

---

## 4. NestJS Architecture Rules

### Layering

Controllers:

- parse inputs
- call application services
- return schema-inferred plain objects
- contain no business logic
- never call Prisma directly

Services:

- orchestrate business logic
- validate rules that depend on database state, lifecycle state, other services, or providers
- coordinate repositories/providers
- never access Prisma directly — all data access must go through repositories

Repositories:

- contain database access
- hide Prisma details from controllers
- expose intention-revealing methods
- are the only layer that calls Prisma directly

Schemas and output conversion:

- define request/response shape
- validate every request rule that can be decided exclusively from the request through Zod
- map database/provider representations to explicit public output objects
- rely on the response serializer for final transport validation and transformation
- must remain simple

### Private Members

Private class members must be prefixed with `_`.

Example:

```ts
private _buildCursor(): string {}
```

### Dependency Injection

Use NestJS dependency injection.

Do not instantiate services manually unless there is a clear technical reason.

---

## 5. Coding Conventions

### Keep Instructions Beside Their Scope

Keep the repository-root `AGENTS.md` limited to guidance that applies across the repository.

When an instruction describes the architecture, boundary, workflow, tooling, or conventions of one specific directory, put it in an `AGENTS.md` at that directory's narrowest shared scope instead of adding it to the root file. Nested `AGENTS.md` files supplement the instructions inherited from their parents.

When existing root guidance becomes specific to one directory, move it to that directory's `AGENTS.md`; do not duplicate it in both places.

### Keep Guidance Independent of Source Layout

Do not mention concrete repository paths, source filenames, or inventories of currently implemented routes in `AGENTS.md`, documentation, or other guidance files. Describe stable ownership, responsibilities, naming conventions, and discovery rules instead.

Guidance must remain correct when an implementation file moves, splits, is renamed, or when another route is added. Refer to concepts such as the owning module, Queue manifest, environment-validation boundary, generated Worker environment type, or deployment workflow rather than the file that currently implements them.

Exact commands, public contracts, and filename patterns may be documented when the exact spelling is itself a stable interface. Do not use them merely as navigation shortcuts or as a snapshot of the current codebase.

### Clarity Over Cleverness

Code must be boring, explicit, and easy to review.

Never use ambiguous names. Choose simple, descriptive names for variables, functions, methods, classes, types, files, and modules so a reader can understand what each thing does from its name alone, without reading its implementation or searching for additional context.

Before naming any class, enum, type, variable, function, method, or file, ask whether the same concept can be reused by another known or likely use case. If its meaning and behavior are independent of the current transport, provider, or feature, use a generic domain name so adding the next use case does not require renaming the shared concept. For example, use `AuthIntentStatus` when the lifecycle applies equally to WhatsApp, email, or another authentication transport.

When a concept is inherently tied to one integration or transport, make that ownership explicit in its name. For example, Meta webhook verification tokens and WhatsApp phone-number IDs must retain provider-specific names because their meaning does not generalize beyond that integration.

Variable and function names must describe both the **input format** and the **transformation/output**. Reading the name alone must reveal what value you pass in and what comes out — no implementation-reading required.

Names must also describe the operation the implementation actually performs. Do not use verbs that imply validation, authentication, mutation, or orchestration when the function only queries and returns a value. Query-only methods should use verbs such as `find` or `get`; reserve names such as `authenticate`, `validate`, `create`, or `rotate` for functions that actually perform those actions.

Name functions and methods after their caller-visible outcome, not the internal steps used to produce it. A name should state the single most important result. Mention two outcomes only when both must happen together as one operation and separating them would make the behavior incorrect. Make alternative outcomes explicit when they are part of the contract, such as `OrNull` for a lookup that may not find a value.

Avoid implementation-oriented names that merely say work occurs:

```ts
processMessage();
handleWebhook();
runAuthenticationFlow();
```

Prefer the outcome visible to the caller:

```ts
verifyWhatsappAuthCode();
enqueueAuthMessagesFromWebhook();
getCodeOrNull();
verifyAuthMessageAndReply(); // Two inseparable outcomes: verification always produces the reply.
```

Framework-mandated method names such as `canActivate` and shared interface methods such as a Queue handler's `handle` may keep the required contract name.

Bad — implies that the repository performs the complete authentication operation:

```ts
authenticateAccessToken({ accessTokenHash: accessTokenHash });
```

Good — describes that the repository finds and returns the matching access-token session:

```ts
findActiveAccessToken({ accessTokenHash: accessTokenHash });
```

Bad — vague transformation, unknown input format:
```ts
normalizeLocale("pt-br")        // normalize what? what do I pass in?
formatLocaleCasing("pt-br")      // "casing" tells the what, but "locale" is unclear — what is a locale?
```

Good — input format + transformation are both explicit:
```ts
formatBcp47LocaleTag("pt-br")   // "I pass a BCP 47 locale tag like pt-br, and it formats it"
```

The function name `formatBcp47LocaleTag` tells you:
- **Input**: a BCP 47 locale tag (a well-known standard string format like `pt-br`, `en-US`)
- **Output**: the formatted version of that tag (language lowercase, region uppercase → `pt-BR`)

Avoid:

```ts
const p = await repo.find(id);
```

Prefer:

```ts
const post = await this._postsRepository.findById({ postId });
```

### Named Parameters

Always use named (object) parameters unless the sole parameter is self-evident from the function name alone.

**Test: is the parameter "clean"?** If you can look at the call site and instantly know what every value means without reading the function signature, it's clean. Otherwise, use named params.

Use named param — `languageCode` is a domain concept, the call site doesn't explain it:

```ts
buildSystemPrompt({ languageCode: "por" });
findNearbyPosts({ cityId, categoryId, cursor, limit });
```

Don't use named param — `a` and `b` are trivially clear:

```ts
multiply(a, b);
```

A single domain-ambiguous argument is enough to require named params. Every value at the call site must be obvious *without* checking the function signature.

**Always use explicit key-value pairs** — never shorthand. This makes it safer to rename the local variable without changing the API contract.

Wrong — shorthand makes it hard to tell key from value:

```ts
buildUserPrompt({ description, title, languageCode });
```

Correct — explicit pairs decouple the key (API) from the value (local):

```ts
buildUserPrompt({ description: description, title: title, languageCode: languageCode });
```

If you rename the local var `languageCode` to `lang`, the shorthand form `{ languageCode }` breaks the API (it'd pass `lang` as `languageCode`). The explicit form `{ languageCode: lang }` is a one-word fix and makes the intent obvious.

Note: Biome cannot enforce this lint — its `useShorthandAssignments` rule (part of the recommended preset) does the opposite. This is a code review convention.

### Guard Clauses

Prefer early returns and guard clauses.

Avoid deeply nested `if/else` blocks.

### No Default in Switches

Never use `default` in a `switch` statement. A default branch silently absorbs unhandled enum values or cases, making it impossible for the compiler to warn when new values are added. The code should always break/error explicitly so every addition hits every switch site:

```ts
function formatContactMethod(method: JobContactMethod): string {
	switch (method) {
		case JobContactMethod.WHATSAPP:
			return "WhatsApp";
		case JobContactMethod.PHONE_CALL:
			return "Phone Call";
	}
}
```

Adding a new enum value without a case here will cause a compile error, forcing you to handle the new case or explicitly decide what to do.

### Explicit Behavior Per Variant

When validation or behavior depends on an enum, discriminator, provider, channel, contact method, status, or similar value family, define the accepted behavior explicitly for each supported member. Do not put a broad condition before variant-specific handling when that condition could accidentally authorize a future member.

Prefer closed designs such as:

- Zod discriminated unions with one branch per supported input variant;
- exhaustive `switch` statements without `default`;
- mappings checked with `satisfies Record<DomainEnum, ...>` when every enum member must be implemented.

A newly added value must either produce a compile-time failure or remain rejected at runtime until its rules are deliberately implemented. It must never silently inherit another member's validation, authorization, serialization, or business behavior.

Bad — every current or future contact method accepts a phone number before its own rules run:

```ts
if (isValidPhoneNumber(contact.identifier)) return;

if (contact.contactMethod === JobContactMethod.WHATSAPP && isWhatsappUsername(contact.identifier)) return;
```

Good — each supported contact method owns its complete validation contract:

```ts
const ContactInputSchema = z.discriminatedUnion("contactMethod", [
	z.object({
		contactMethod: z.literal(JobContactMethod.WHATSAPP),
		identifier: WhatsappContactIdentifierSchema,
	}),
	z.object({
		contactMethod: z.literal(JobContactMethod.PHONE_CALL),
		identifier: PhoneNumberSchema,
	}),
]);
```

### Type Safety

Do not use `any`.

Prefer:

- explicit interfaces
- Zod-inferred contract types
- Prisma-generated types
- `unknown` plus narrowing when input is truly unknown

### Interface Naming

Only `interface` declarations may use the `I` prefix.

Never use the `I` prefix on `type` aliases, classes, or enums.

Examples:

```ts
// Good — interface
IAccessTokenPayload;

// Bad — type alias with I prefix
type IErrorCode = ...;

// Good — type alias without I prefix
type ErrorCode = ...;
```

### Inline Single-Use Values and Logic

Choose the narrowest scope that matches actual reuse:

- If a value is used once, keep it inline at its consumer.
- If a value is used more than once within one function or method, use a function-local variable instead of extracting it to a module or exported constant.
- Use a module or exported constant only when the value is shared across consumers or represents independently important domain configuration.

Bad — the function-local variable still adds indirection for a single use:

```ts
function requestPage(): Promise<Response> {
	const pageSize = 20;
	return client.get({ limit: pageSize });
}
```

Good — the single-use value stays at its consumer:

```ts
function requestPage(): Promise<Response> {
	return client.get({ limit: 20 });
}
```

Good — a value repeated only inside one function remains local:

```ts
function generateCode(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return alphabet.charAt(randomInt(alphabet.length));
}
```

Apply the same rule to functions and methods. Do not extract a helper that has only one caller when its logic is short, readable, and naturally belongs to that caller. Inline the logic so a reader does not need to jump between declarations to understand one operation.

Bad — the constant adds indirection without reuse:

```ts
const DERIVE_JOB_DATA_MAX_TOKENS = 10_000;

await aiService.generateObject({
	maxTokens: DERIVE_JOB_DATA_MAX_TOKENS,
});
```

Good — the value is clear at its only call site:

```ts
await aiService.generateObject({
	maxTokens: 10_000,
});
```

Extract a value beyond its function only when it is reused across consumers or represents an independently important domain concept. Test the behavior at the consumer instead of creating and testing a constant solely for a single call site.

Bad — the helper is called once and only adds navigation:

```ts
function _asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

	return value as Record<string, unknown>;
}

function parseMessage(requestBody: unknown): Message | null {
	const jobId = _asRecord(requestBody)?.["jobId"];
	// ...
}
```

Good — the sole consumer performs the small narrowing operation directly:

```ts
function parseMessage(requestBody: unknown): Message | null {
	if (typeof requestBody !== "object" || requestBody === null || Array.isArray(requestBody)) return null;
	// ...
}
```

Extract single-use logic only when it represents independently meaningful behavior, requires focused testing, removes substantial complexity from its caller, or is expected to gain another caller imminently for a concrete requirement. A descriptive helper name alone is not enough reason to extract it.

### Constants

Do not repeat an obvious domain prefix inside a constants object when the object name already supplies that context. For example, use `AuthSessionConstants.SESSION_TOKEN_BYTES`, not `AuthSessionConstants.AUTH_SESSION_TOKEN_BYTES`.

Avoid magic numbers and repeated domain strings.

Prefer TypeScript `enum` over `const` objects for error codes, status values, and domain constants. Enums provide both the value and the type in one declaration, are easy to switch over, and don't require a separate type extraction.

String enum values must always be UPPERCASE. Never use lowercase or snake_case string enum values.

Create named constants for shared or independently domain-critical:

- limits
- expiration windows
- header names
- cookie names
- event names
- queue names
- cache keys

Small one-off test descriptions, local validation messages, and obvious Swagger prose do not need constants unless repeated or domain-critical.

Do not create a constants file for values used in only one place. Inline the value where it is used. Constants files and `*Constants` objects are for values referenced from multiple locations.

### Constant File Structure

Every constants file (`*.constants.ts`) must export its values through a single `*Constants` object (named after the domain), not as individual exports.

Good:

```ts
const JOB_LOCATION_FUZZY_MIN_DISTANCE_METERS = 300;
const JOB_LOCATION_FUZZY_MAX_DISTANCE_METERS = 500;

export const JobLocationConstants = {
	JOB_LOCATION_FUZZY_MIN_DISTANCE_METERS,
	JOB_LOCATION_FUZZY_MAX_DISTANCE_METERS,
} as const;
```

Bad:

```ts
export const JOB_LOCATION_FUZZY_MIN_DISTANCE_METERS = 300;
export const JOB_LOCATION_FUZZY_MAX_DISTANCE_METERS = 500;
```

Consumers always import the constants object:

```ts
import { JobLocationConstants } from "./job-location.constants";

JobLocationConstants.JOB_LOCATION_FUZZY_MIN_DISTANCE_METERS;
```

### No Dead Code

Do not leave unused code, commented-out blocks, unused imports, or speculative abstractions.

Every line must exist for the current task.

### Local Extensibility

Design every family of related values so a new member can be added locally without a broad refactor. Adding a queue, AI task, status handler, provider, event, or similar value should require a small additive change at one clear extension point, plus its implementation and tests—not edits across scattered conditionals, duplicated mappings, or unrelated modules.

Minimize the number of files and declarations that must change when extending existing behavior. Put each contract or value family in one authoritative source and derive its TypeScript types, runtime validation, dispatch, documentation, and downstream constraints from that source whenever practical. Adding a field, enum member, queue message property, or handler must not require repeating the same information manually in multiple files.

Before adding another mapping, validator, interface, or duplicated literal, ask whether it can be generated or inferred from the existing source of truth. Prefer designs where changing the authoritative declaration either updates every consumer automatically or produces compile-time failures at consumers that must supply new behavior.

Prefer:

- one registry, router, strategy map, or handler boundary for dispatch;
- one source of truth from which supported values, validation, documentation, and error messages are derived;
- focused implementations behind a stable interface;
- exhaustive tests for every registered value and the unsupported-value path.

Keep the extension point proportional to the feature. Do not create speculative abstraction layers for hypothetical requirements, but when implementing a known value family, establish the smallest structure that lets the next value be added without redesigning the existing code.

### Inline Object Types Over Single-Use Interfaces

If an object parameter type is used in exactly one place (e.g., one function signature), define it inline rather than as a named interface.

Good:

```ts
async findNearbyPosts(params: {
	categoryId: string;
	locationPoint: {
		latitude: number;
		longitude: number;
	};
}): Promise<Post[]> {}
```

Bad:

```ts
interface ILocationPointParams {
	latitude: number;
	longitude: number;
}
// used only once below
async findNearbyPosts({ locationPoint, categoryId }: { locationPoint: ILocationPointParams; categoryId: string }) {}
```

This avoids unnecessary named types that add indirection without reuse.

### Module-Private Functions

Top-level functions that are only used within the same file (not exported via the namespace or directly) must be prefixed with `_`.

This mirrors the private class member convention and makes it immediately clear which functions are internal implementation details.

Good:

```ts
function _formatSingleError(error: ValidationError, parentPath?: string): string[] {
	// ...
}

function formatValidationErrors(errors: ValidationError[]): string[] {
	return errors.flatMap((error) => _formatSingleError(error));
}

export const ValidationErrorFormatter = {
	formatValidationErrors,
} as const;
```

### Utility/Helper Files

Do not create a separate utility or helper file for logic that is only used in one place. Keep the logic in the module where it is used, typically as a private method on a service or a module-private function.

Utility files are for logic shared across multiple modules or files. Single-use logic should stay co-located with its consumer.

### Utility Functions

Export reusable utility functions directly as named function exports. Do not wrap functions in a `*Utils` object solely to create a namespace; ES module imports already provide clear ownership and allow consumers to import only what they use.

Good:

```ts
export function filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}
```

Bad:

```ts
export const ObjectUtils = {
	filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> { ... },
} as const;
```

### Use Zod and Domain-Library Built-ins Before Custom Validation

Always check whether Zod or an authoritative domain library already provides the validation before writing custom logic. Use Zod primitives such as `z.uuid()` and `z.iso.datetime()` for transport shape, and use focused libraries such as `libphonenumber-js` for domain formats instead of recreating them with ad hoc checks.

### Derive Enum Values From the Code, Never Hardcode

Never hardcode enum values, list contents, or any domain constants that already exist in the codebase. Always derive them from the source of truth at runtime.

Good — building the error message from the actual enum:
```ts
const _VALID_CONTACT_METHODS_LIST = Object.values(JobContactMethod).join(", ");
// → "contact_method must be set to a supported contact method (WHATSAPP, PHONE_CALL)"
```

Avoid — hardcoding values that will become stale:
```ts
"contact_method must be set to a supported contact method (WHATSAPP or PHONE_CALL)"
```

This ensures that adding a new enum value automatically updates all derived messages, switches, and serialization logic. No manual update, no drift, no forgotten sites.

---

## 6. Error Handling

### Try/Catch Boundaries

Only add `try/catch` when the catch block performs meaningful recovery or cleanup, or translates an expected failure into a typed error that helps the client understand and act on the problem.

Do not catch internal database, cache, provider, or tooling failures merely to replace them with another generic error. Let unexpected internal failures propagate to the global exception filter, which is responsible for logging them and returning the safe generic error response.

Do not use an empty `catch {}` when the original exception is needed for diagnostics.

### Domain Errors

Use typed/domain-specific errors.

Errors should include stable error codes that can be safely exposed to clients.

Example codes:

```txt
POST_NOT_FOUND
POST_EXPIRED
POST_ALREADY_REPORTED
INVALID_CURSOR
RATE_LIMITED
```

### Do Not Leak Internals

Never expose:

- SQL errors
- Prisma internals
- stack traces
- provider secrets
- internal IDs that should not be public

### Consistent Error Responses

All API errors should follow one response shape.

Example:

```json
{
	"errorCode": "POST_NOT_FOUND",
	"message": "The requested post was not found."
}
```

### Error Message Descriptiveness

Error messages must be deeply descriptive — a developer with zero context about the codebase should understand exactly what went wrong and how to fix it within seconds.

Every validation error message must:

1. **Name the field** that failed: say `identifier` not `"The field"` or `"Value"`. Example: `"identifier must be a string"`, not `"Invalid value"`.
2. **Explain what's wrong** specifically: say `"must be a phone number with country code, starting with + and followed by 7 to 15 digits"`, not `"invalid format"` or `"validation failed"`.
3. **Include an example** where possible so the developer knows exactly what to send: `"Example: +5511999999999"`.

A good error message lets the developer fix the problem without reading any docs, looking at the schema, or asking for help.

---

## 7. Security, Trust & Safety

Cataquí operates in a high-risk marketplace category.

Trust and safety must be treated as core product infrastructure, not a later feature.

### Rate Limiting

- Cloudflare owns volumetric and IP-oriented protection. Do not add a global NestJS IP rate limiter.
- Use the Redis-backed `@RateLimit` only on authenticated operations where repeated use can create material cost or harm.
- `@RateLimit` must require the access token before running `UserRateLimitGuard`, which tracks `session.userId` and shares the limit across that user's devices, sessions, and containers. Do not pair `@RateLimit` with a separate `@AccessTokenRequired()` decorator. Never key an application limit by IP address, session ID, or access-token hash.
- If Redis cannot enforce a protected operation's limit, fail closed before the expensive or harmful operation runs.

---

## 8. Testing Protocol

### Philosophy

Untested business logic is broken business logic.

Tests must prove:

- the happy path works
- invalid states fail safely
- serialization is correct
- security-sensitive behavior is protected
- bugs do not regress

### Test Files

Every file containing meaningful logic must have a corresponding `.spec.ts` file.

Files that may not require dedicated tests:

- pure type-only files
- barrel exports
- generated files
- trivial module wiring with no logic

When unsure, write the test.

### Vitest Configuration

Test runner: **Vitest** with `globals: true`.

Test files must be colocated with source: `src/**/*.spec.ts`. E2E tests may also be placed in `test/**/*.spec.ts`.

Coverage provider: **v8** with minimum 90% thresholds for lines, functions, branches, and statements.

Module wiring files (`*.module.ts`, `app.module.ts`, `main.ts`, barrel `index.ts` files) are excluded from coverage thresholds.

Run commands:

```bash
pnpm test          # run all tests
pnpm test:watch    # watch mode
pnpm test:cov      # run with coverage
```

### Test-Driven Workflow

For new logic:

1. Write or update the test first.
2. Confirm it fails for the expected reason.
3. Implement the smallest correct solution.
4. Run the affected test suite.
5. Run lint/typecheck when relevant.

### Test Descriptions

Always describe the expected outcome in plain English. Tests are documentation for the code: a reader should be able to understand how the code behaves by reading only the test descriptions, without inspecting the implementation or assertions.

Prefer:

```typescript
it("should allow every field in UpdateJobInputSchema to be updated", () => {});
```

Avoid descriptions that only name an internal mechanism or test step:

```typescript
it("should call the repository", () => {});
```

### Schema & Serialization Tests

Because Zod is the authoritative runtime and documentation contract, test validation and serialization through the schema.

Verify that:

- output schemas expose the declared camelCase contract
- output mappers convert database representations without exposing private fields
- request schemas validate camelCase payloads

### Bug Fixes

Every bug fix must include a regression test.

The regression test must:

- reproduce the bug
- fail before the fix
- pass after the fix
- be named after the scenario

Only skip a regression test if deterministic testing is impossible. If skipped, document why in the code review/commit notes.

### Non-Obvious Correctness Invariants

Always add a focused regression test when correctness depends on a relationship that is easy to break during an otherwise reasonable refactor. Examples include operation ordering, database persistence before Queue publication, atomic state transitions, authorization scope, idempotency, retry behavior, and cleanup after partial failure.

Do not consider the invariant covered merely because separate tests prove that each operation occurred. Assert the important relationship directly. For example, if a Queue consumer must never observe state before it is persisted, record the completed operations and assert that persistence finishes before Queue publication.

Test these invariants as caller-visible correctness guarantees, not arbitrary implementation details. The test description must explain the failure being prevented so a future contributor understands why the ordering or relationship must remain unchanged.

### Property-Based / Fuzz Testing

Use `fast-check` for property-based fuzz testing whenever a function accepts values from a meaningful domain.

Prefer fuzzed inputs over a few raw example values for:

- pure utilities
- validators
- parsers
- serializers
- math and range logic
- security-sensitive logic
- domain rules

Property tests must define valid input domains explicitly and assert invariants that should hold for all generated values.

Fixed example values are still allowed for:

- regression tests for a known bug
- exact edge cases that document intended behavior
- schema construction and test setup
- mocks and spies
- snapshots or serialization examples
- tests where a single literal value is the behavior being specified

### One Assertion Per Test

Every test must contain exactly one `expect` or assertion call. If a behavior requires multiple assertions, split it into multiple tests.

**Incorrect (multiple assertions in one test):**

```typescript
it("should return a valid post", async () => {
	const post = await service.findById("123");

	expect(post).not.toBeNull();
	expect(post.title).toBe("Help Wanted");
	expect(post.status).toBe(JobStatus.ACTIVE);
});
```

**Correct (one assertion per test):**

```typescript
it("should return a post when found", async () => {
	const post = await service.findById("123");

	expect(post).not.toBeNull();
});

it("should return the correct title", async () => {
	const post = await service.findById("123");

	expect(post.title).toBe("Help Wanted");
});

it("should return an active status", async () => {
	const post = await service.findById("123");

	expect(post.status).toBe(JobStatus.ACTIVE);
});
```

This ensures that:

- each test has a single, clear reason to fail
- test names describe exactly what is being verified
- failures are immediately obvious without reading assertion details

### Test Independence

Each test must set up the specific values it asserts on within its own `it()` block. Do not rely on shared mock defaults (from `beforeEach` or module-level factories) to produce the exact value a test claims to verify. Changing a shared default must not break unrelated tests.

If a test asserts `result.contactMethod === "WHATSAPP"`, the test must explicitly configure the mock to return `"WHATSAPP"` in that `it()` block — even if the shared mock already happens to return that value.

Shared setup (`beforeEach`) is allowed for wiring the test module and creating the system under test. It is **not** allowed for providing the specific return values that a test asserts on.

This applies to **all** assertions — not just specific expected values, but also existence checks (e.g., `toBeInstanceOf`, `not.toBeNull`), type checks, and any other validation that depends on the test's runtime state. If a test depends on a mock returning a value for its assertion, that test must set up the mock return value itself. The only exception is pure infrastructure assertions (e.g., "the module compiled correctly").

### 100% Coverage for Every Feature

Every new feature or change must include tests that cover 100% of the possibilities it introduces:

- **All code paths** — every branch, early return, error case, and happy path must have a dedicated test
- **All input variations** — every meaningful input permutation (boundary values, nulls, edge cases) must be tested
- **All side effects** — every function call, database write, external API invocation, and log statement triggered by the feature must be verified
- **All integration points** — parameter values passed to dependencies must be asserted explicitly, not just that the dependency was called

A feature is not complete until its test suite proves every line and every state transition it introduces. If a test cannot be written for a specific scenario, document why in the commit or PR notes.

---

## 9. API Documentation

Every public NestJS API endpoint must have Swagger documentation.

Each public controller endpoint must have a dedicated docs decorator or clearly separated docs helper.

Container-only inbound controllers must not be exposed in public Swagger. Their contracts are owned by the inbound manifest and its Zod input schemas. Hono webhook routes document provider-facing behavior beside their route module rather than through NestJS Swagger.

Swagger docs must explain:

- what the endpoint does
- who should call it
- required params/query/body
- response shape
- status codes
- security implications
- rate limit expectations when relevant

Docs must be written for a developer with zero context about Cataquí.

An endpoint without meaningful Swagger docs is incomplete.

---

## 10. Performance Rules

### General

- Avoid unbounded queries.
- Always paginate list endpoints.
- Use cursor pagination for feeds.
- Add indexes for common query paths.
- Avoid N+1 queries.
- Keep response payloads small.
- Do not return unused fields.

---

## 11. Environment Variables & Secrets

Never commit secrets.

Use environment variables for:

- database URLs
- authentication HMAC and signing keys
- provider API keys
- R2 credentials
- Cloudflare credentials
- encryption secrets

Maintain `.env.example` with safe placeholder values.

Do not put real Neon URLs, passwords, tokens, or production secrets in documentation or tests.

### Adding a New Environment Variable

First identify the runtime that owns the value. Production delivery remains isolated by runtime; the shared local `.env` may contain development values for NestJS and both Workers.

For a value consumed by NestJS inside the API container:

1. Add it to the application's environment-validation boundary.
2. Put its `registerAs` configuration beside the owning feature, or in shared configuration only when multiple features own it. Register and export it from the owning module.
3. Add safe local and documented development values.
4. Add a deterministic test value to the test environment.
5. Declare it in the API Worker's Wrangler configuration through the appropriate non-secret variable or secret-delivery path.
6. Regenerate the API Worker's environment type with `pnpm cf:types`; never edit generated bindings manually.
7. Explicitly allowlist and forward it from the API container boundary into NestJS.
8. Follow the GitHub automation guidance for Infisical profiles and deployment delivery.

For a value consumed only by the Webhooks Worker:

1. Declare it in the Webhooks Worker's Wrangler configuration through the appropriate non-secret variable or secret-delivery path.
2. Add safe local and documented development values.
3. Regenerate the Webhooks Worker's environment type with `pnpm cf:types`; never edit generated bindings manually.
4. Follow the GitHub automation guidance for the isolated Webhooks runtime delivery path.
5. Do not add it to NestJS environment validation, Nest config, API container forwarding, or the API runtime profile unless NestJS independently consumes the same value.

Worker-only bindings and configuration—such as Queues, Durable Objects, container pool sizing, and sleep settings—stay in the owning Wrangler configuration and generated Worker environment type. Do not forward them into the NestJS process.

`ApiContainer.envVars` is a security allowlist. Keep every forwarded value explicit; never spread or automatically forward `Cloudflare.Env`, because it also contains Worker-only bindings and secrets that the application does not need.

Tooling-only credentials remain scoped to their consumer. For example, `DATABASE_OWNER_DIRECT_URL` belongs in local migration tooling and the isolated database-migration profile; it must never be added to Cloudflare bindings, container forwarding, Worker development variables, or application configuration.

---

## 12. Git & Change Discipline

### Before Making Changes

1. Understand the requested change.
2. Inspect existing files and patterns.
3. Research the established convention before introducing or changing an API, architecture, security flow, data model, naming pattern, or operational behavior. Start with current standards and official documentation, then compare how mature, high-scale engineering teams apply them in practice.
4. Follow the strongest convention that fits Cataquí's actual constraints. Do not copy a popular pattern without understanding its purpose, tradeoffs, and failure modes. If the project deliberately differs from the convention, make the reason explicit.
5. Check the package manifest for available scripts.
6. Check the installed project skills for relevant guidance.
7. Make the smallest safe change.

### During Changes

- Keep changes focused.
- Do not refactor unrelated code.
- Do not add speculative abstractions.
- Do not silently change public API contracts.
- Update tests and docs with code changes.

### Before Finishing

Before closing a task, always run non-mutating linting and type checking in addition to tests. A change is not complete until `pnpm lint:check`, `pnpm typecheck`, and `pnpm test` all pass. Do not use the write-mode `pnpm lint` as a validation command because it can modify unrelated files in a dirty worktree.

Run the relevant checks in order:

```bash
pnpm lint:check
pnpm typecheck
pnpm test
```

Run `pnpm build` when build configuration, compiled assets, runtime startup, or deployment packaging changes. Use `pnpm cf:types:check` through the standard typecheck when Wrangler bindings change.

Prefer the smallest relevant module-level checks first, then run the broader required checks. Preserve unrelated staged and unstaged work; never use a write-mode validation command across the whole dirty repository.

If a command cannot be run, clearly state why.

---

## 13. Open Source Readiness

This API is private today, but may become open-source later.

Write code as if it may be public:

- no secrets
- no embarrassing shortcuts
- clear docs
- clean architecture
- meaningful tests
- no hidden local assumptions

However, do not expose sensitive operational logic unnecessarily.

Treat the following as especially sensitive:

- anti-spam logic
- fraud detection
- moderation heuristics
- abuse signals
- security controls
- private operational tooling

---

## 14. Language & Naming

### Product Language

The product is Cataquí.

Use the accented brand name in human-facing docs when appropriate:

- Cataquí

Use ASCII-safe names in code, package names, domains, schemas, and identifiers:

- `cataqui`

### Brand Names in Code

Treat every brand name as a single word when it appears in a code identifier. Capitalize only the first letter of the complete brand name in PascalCase, or lowercase the complete brand name in camelCase. Do not preserve the brand's internal capitalization because it misleadingly suggests separate words in the identifier.

Good:

```ts
class WhatsappAuthService {}

const whatsappPhoneNumberId = "...";
```

Bad — `WhatsApp` can be misread as the separate words "Whats" and "App":

```ts
class WhatsAppAuthService {}

const whatsAppPhoneNumberId = "...";
```

Preserve the official brand spelling only in human-facing prose and display strings, where `WhatsApp` is correct.

### Domain Language

Prefer simple terms:

- `post`
- `feed`
- `job`
- `task`
- `report`
- `category`
- `city`
- `neighborhood`

Avoid corporate HR terms unless absolutely necessary:

- applicant tracking
- requisition
- candidate pipeline
- human capital

Cataquí is not corporate HR software.

---

## 15. Agent Behavior Rules

When acting as an AI coding agent in this repository:

1. Follow this file over generic preferences.
2. Prefer simple, boring, production-quality code.
3. Ask clarifying questions only when the task is truly ambiguous.
4. Do not invent product requirements.
5. Do not add dependencies without a clear reason.
6. Do not change architecture casually.
7. Do not bypass tests to make a task appear complete.
8. Do not hide failures.
9. If something cannot be done safely, explain the tradeoff.
10. Optimize for Cataquí’s core loop: post → discover → WhatsApp contact.

---

## 16. Golden Engineering Rule

The API exists to make the Cataquí feed feel alive, safe, and fast.

Every technical decision should support one of these outcomes:

- more real opportunities
- faster discovery
- safer interactions
- cleaner moderation
- better local relevance
- lower user friction

If a change does not support one of those outcomes, question whether it belongs in the product now.
