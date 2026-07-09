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
- managing lightweight user identity later

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

- Runtime: **Node.js LTS**
- Package manager: **pnpm**
- Framework: **NestJS**
- HTTP adapter: **Fastify adapter**
- ORM: **Prisma**
- Database: **PostgreSQL on Neon**
- File/media storage: **Cloudflare R2** or S3-compatible storage
- Edge/security layer: **Cloudflare DNS/CDN/WAF/Turnstile**
- Test framework: **Vitest**

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

External API payloads must use `snake_case`.

Internal TypeScript code must use `camelCase`.

Example:

```json
{
	"post_id": "...",
	"created_at": "...",
	"whatsapp_url": "..."
}
```

Internal:

```ts
postId;
createdAt;
whatsappUrl;
```

### DTO Serialization

For DTOs exposed through the API:

- Use explicit DTO classes.
- Use `@Expose({ name: "snake_case" })` for external field names.
- Use `@ApiProperty({ name: "snake_case" })` for Swagger documentation.
- Output DTOs must be constructible through constructors.
- Do not use `!` non-null assertions on output DTO properties.

### DTO Member Ordering

Members within a DTO class must follow this order:

1. Constructor
2. `static` factory methods
3. Variables / properties (including `readonly`)
4. Utility methods
5. Private helpers (prefixed `_`)

Example:

```ts
export class JobContactOutputDto {
	constructor(params: { ... }) { ... }

	static fromDatabase(...): JobOutputDto { ... }

	readonly contactMethod: JobContactMethod;

	getIdentifier(): string { ... }

	private _buildCursor(): string { ... }
}
```

### Cursor Pagination

Infinite feeds must use cursor pagination, not offset pagination.

Good:

```txt
GET /v1/feed?cursor=...&limit=20
```

Avoid:

```txt
GET /v1/feed?page=10
```

---

## 4. NestJS Architecture Rules

### Layering

Controllers:

- parse inputs
- call application services
- return DTOs
- contain no business logic
- never call Prisma directly

Services:

- orchestrate business logic
- validate domain rules
- coordinate repositories/providers
- never access Prisma directly — all data access must go through repositories

Repositories:

- contain database access
- hide Prisma details from controllers
- expose intention-revealing methods
- are the only layer that calls Prisma directly

DTOs:

- define request/response shape
- handle transformation/serialization
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

### Clarity Over Cleverness

Code must be boring, explicit, and easy to review.

Variable and function names must describe both the **input format** and the **transformation/output**. Reading the name alone must reveal what value you pass in and what comes out — no implementation-reading required.

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

### Type Safety

Do not use `any`.

Prefer:

- explicit interfaces
- DTOs
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

### Constants

Avoid magic numbers and repeated domain strings.

Prefer TypeScript `enum` over `const` objects for error codes, status values, and domain constants. Enums provide both the value and the type in one declaration, are easy to switch over, and don't require a separate type extraction.

String enum values must always be UPPERCASE. Never use lowercase or snake_case string enum values.

Create named constants for:

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

Utility files and exported namespaces are for logic shared across multiple modules or files. Single-use logic should stay co-located with its consumer.

### Utility Functions

Do not export bare standalone utility functions and do not inline function logic directly inside the namespace object.

Define each function as a standalone declaration first, then group them under an exported namespace.

Good:

```ts
function filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export const ObjectUtils = {
	filterUndefined,
} as const;
```

Bad:

```ts
export function filterUndefined() {}
```

Also bad — inline inside namespace:

```ts
export const ObjectUtils = {
	filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> { ... },
} as const;
```

### Use class-validator Built-ins Before Custom Validation

Always check if `class-validator` has a built-in validator (decorator or standalone function) before writing custom validation logic. This applies to both DTO property decorators (`@IsPhoneNumber`, `@Matches`, etc.) and standalone functions used inside custom decorators (`isPhoneNumber`, `isString`, etc.).

The library exports standalone validation functions alongside the decorators — use them instead of raw inline checks.

Good — using the built-in standalone function:
```ts
import { isPhoneNumber } from "class-validator";

if (!isPhoneNumber(identifier)) { ... }
```

Avoid — reinventing it inline:
```ts
if (!identifier.startsWith("+") || identifier.length < 8) { ... }
```

Checking `class-validator` first ensures consistent validation semantics, keeps the codebase small, and reduces review surface for validation logic.

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
	"error_code": "POST_NOT_FOUND",
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

### DTO & Serialization Tests

Because the API uses snake_case externally and camelCase internally, test DTO serialization.

Verify that:

- response DTOs expose snake_case
- internal constructors use camelCase safely
- request DTOs validate snake_case payloads

### Bug Fixes

Every bug fix must include a regression test.

The regression test must:

- reproduce the bug
- fail before the fix
- pass after the fix
- be named after the scenario

Only skip a regression test if deterministic testing is impossible. If skipped, document why in the code review/commit notes.

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
- DTO construction and test setup
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

Every endpoint must have Swagger documentation.

Each controller endpoint must have a dedicated docs decorator or clearly separated docs helper.

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
- JWT secrets
- provider API keys
- R2 credentials
- Cloudflare credentials
- encryption secrets

Maintain `.env.example` with safe placeholder values.

Do not put real Neon URLs, passwords, tokens, or production secrets in documentation or tests.

### Adding a New Environment Variable

Every new env var must be registered in all of these locations. Use this checklist:

1. **`src/core/config/env.validation.ts`** — Add to the Zod schema with appropriate validation
2. **`src/core/config/`** — Update or create a config file (e.g., `map-auth.config.ts`) with the NestJS `registerAs` config token
3. **`src/core/config/config.module.ts`** — Register the config provider and export the token
4. **`.env`** — Add a local development value (gitignored, for your machine only)
5. **`.env.example`** — Add a safe placeholder value for documentation
6. **`vitest.config.ts`** — Add a test default value to the `test.env` block so tests never depend on your local `.env`
7. **`worker/env.d.ts`** — Add the typed binding to the `Env` interface
8. **`worker/container.ts`** — Forward it in the `this.envVars` object so the container receives it
9. **`.dev.vars`** — Add a local development value for `wrangler dev` (gitignored)
10. **`.github/workflows/deploy-staging.yml`** — Add to the `secrets:` list if it's sensitive (e.g., API keys, tokens), or add to `wrangler.jsonc` `env.*.vars` if it's a non-sensitive configuration value (URLs, feature flags). Add to the `env:` block if using a GitHub secret.
11. **`.github/workflows/deploy-production.yml`** — Same as staging
12. **GitHub repository secrets** — If the value is sensitive, add it in the repo settings → Secrets and variables → Actions under the relevant environments (`staging` / `production`). If it's a non-secret var, define it in `wrangler.jsonc` `env.*.vars` instead.

Don't skip any. Missing one means the env var won't reach the container in that context.

---

## 12. Git & Change Discipline

### Before Making Changes

1. Understand the requested change.
2. Inspect existing files and patterns.
3. Check available scripts in `package.json`.
4. Check `.agents/skills/` for relevant project-specific skills.
5. Make the smallest safe change.

### During Changes

- Keep changes focused.
- Do not refactor unrelated code.
- Do not add speculative abstractions.
- Do not silently change public API contracts.
- Update tests and docs with code changes.

### Before Finishing

Before closing a task, always run linting and type checking — in addition to tests. A change is not complete until `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass. Do not skip these even for small changes.

Run the relevant checks in order:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If the repository has more specific scripts, prefer the smallest relevant module-level checks first, then broader checks when needed.

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
