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

Use descriptive names.

Avoid:

```ts
const p = await repo.find(id);
```

Prefer:

```ts
const post = await this._postsRepository.findById({ postId });
```

### Named Parameters

If a function receives more than two arguments, use an object parameter.

Good:

```ts
findNearbyPosts({ cityId, categoryId, cursor, limit });
```

Bad:

```ts
findNearbyPosts(cityId, categoryId, cursor, limit);
```

### Guard Clauses

Prefer early returns and guard clauses.

Avoid deeply nested `if/else` blocks.

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

### No Dead Code

Do not leave unused code, commented-out blocks, unused imports, or speculative abstractions.

Every line must exist for the current task.

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
- static constant-only files
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

Run the relevant checks:

```bash
pnpm test
pnpm lint
pnpm typecheck
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
11. Always update SKILL.md when doing a modification that affects how the API is used from external actors, so we always keep up to date.

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
