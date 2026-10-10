# AGENTS.md — Cataquí Backend

## Mission and Scope

This repository is the Cataquí backend monorepo. It owns the APIs and backend infraestructure needed to run Cataquí as the best way as possible.

Cataquí is the real-time gig/freelance layer of the city, containing all the local opportunities in a single app, making it easy to discover jobs/gigs/freelance and make fast local money. Optimize every product-facing change for fast discovery, low friction, local relevance, freshness, and trust. Do not turn the product into corporate recruiting or staffing software.

## Workspace Ownership

- `apps/api` owns the NestJS application, Prisma schema and migrations, API routing Worker, API container boundary, and API image. This API is the main orchestrator and main entry point for most things related directly to what Cataquí is. This own the core of cataqui, things like posting jobs, getting feed, etc. 
- `apps/workers/*` contains independently deployable Cloudflare Workers microservices. These are made to not stress the main API over stuff that can be independently managed and are not core to Cataquí. Things such as webhook services, Address searching services and non critical services should have a worker instead of being embedded in the main API.
- `packages/*` owns shared packages across apps. Things that many different apps access should be declared here instead of duplicating work.
- `infrastructure` owns the whole infrastructure for running all Cataquí products, including the complete `cataqui.com` Cloudflare zone: DNS, DNSSEC, WAF, bot management, rate limits, and zone settings.

Cross-workspace behavior must use a named package and its public `package.json` exports. Never use relative imports across workspace boundaries, deep-import another workspace, or create generic `common`, `shared`, or `utils` packages. Keep provider-owned contracts at their integration boundary even when their current fields resemble an owned contract.

## Instruction Scope

Before changing a file, check its directory and parent directories for nested `AGENTS.md` files. Apply every applicable instruction; when instructions conflict, the `AGENTS.md` closest to the file being changed takes precedence over parent guidance.

## Human Communication and Decisions

- Explain consequential implementation choices to the human, including what changed, why, and any limitations, unsupported scenarios, manual requirements, or failure behavior. Raise these during the work and include unresolved limitations in the handoff; writing them only in documentation is not sufficient.
- Do not silently narrow the agreed scope or introduce operational restrictions. When a choice changes expected behavior, deployment safety, rollback support, or required manual work and the human has not already chosen that tradeoff, explain the alternatives and ask what to do before implementing the dependent change. Routine implementation details within the agreed scope do not require repeated approval.
- For example, a deployment flow that supports an initial Durable Object migration but fails on later migrations must be explicitly discussed. Do not present that flow as complete without explaining the unsupported case and agreeing on its handling.

## Documentation

- Keep READMEs focused on general project context, purpose, high-level architecture, prerequisites, setup, and basic development commands.
- Do not append every feature change or explain each subsystem's internal behavior in a README. Avoid detailed request flows, implementation walkthroughs, and duplicated API contracts.
- Put endpoint details in the owning Swagger/OpenAPI documentation and deeper architecture or operational procedures in focused documentation or runbooks. Link to those sources from the README when useful.

## Toolchain

- Node.js 24, TypeScript 6, pnpm, Biome, Vitest, Wrangler and OpenTofu for infrastructure setup.
- Keep every GitHub Action and workflow under `.github`; never place action metadata or workflow files beside application, package, or infrastructure source code.
- Only the root `pnpm-lock.yaml`; never add npm, Yarn, or Bun lockfiles.
- Add dependencies to the workspace that imports them. Use `workspace:*` for internal packages and the root catalog for genuinely shared versions.
- Every application and package must keep independent `build`, `typecheck`, `test`, `test:cov`, and `clean` scripts.
- Shared packages publish compiled `dist` entrypoints. Build dependencies before consumers with recursive or dependency-aware pnpm filters.
- Do not add Turbo or Nx.

## Layer Responsibilities

- Repositories own real external boundaries: database and storage access, provider calls, and infrastructure bindings. Translate provider results into narrow typed data, explicit outcomes, or owned errors. Do not construct public HTTP responses or choose their status codes and headers.
- Services own business rules and orchestration. Coordinate repositories and other owned services, and return transport-independent data or outcomes. Keep services independent of HTTP responses, request contexts, and presentation formatting. Durable Object coordinators follow the same separation for their RPC results.
- Keep each service exclusively focused on the capability it owns. A service that supplies one part of a larger result must return that part; the service owning the complete result coordinates its contributors. Prefer the existing calling service when that orchestration belongs to its capability, and introduce another service only when the responsibility has an independently meaningful owner. For example, a pricing service calculates a price; the checkout service coordinates pricing, payment, and order creation. Do not make the pricing service own the entire checkout merely because checkout needs a price.
- Keep service-owned logic with a single production consumer inside that service, using private methods when useful. Do not extract its business rules or orchestration into standalone helper files merely to shorten the service or test the helpers separately; test the behavior through the service's public methods. Extract code only when it has real reuse or owns an independent boundary or contract, such as a provider integration or runtime schema.
- Controllers, routes, and response adapters own the public transport contract: request parsing and validation, authentication at ingress, status codes, response headers, serialization, and error presentation. Call services for business behavior; do not perform storage queries or provider operations directly.
- Provider-specific transport mechanisms remain at their integration boundary. A repository may use HTTP to call an external provider, pass native conditional-read headers to storage, or persist storage metadata; this does not make it responsible for the application's public HTTP response. Keep shared representation and cache policy in explicitly owned feature contracts rather than importing a response adapter into a repository.

## Shared Engineering Conventions

- Keep code explicit, unsurprising, strictly typed, and locally extensible. Do not use `any`, dead code, speculative abstractions, or broad catch-and-rethrow blocks.
- Prefer guard clauses and exhaustive closed variants. Never add a `default` branch that hides an unhandled enum member.
- Use named object parameters unless every positional value is self-evident at the call site. Spell object keys and values explicitly instead of shorthand.
- When source and destination inputs use independently defined types, map each field explicitly even when their properties match. Do not forward the whole object or spread it into the destination input; pass it directly only when both sides intentionally reuse the same input contract.
- Name fields relative to their containing object. Avoid repeating the object's name when the context already makes it clear: e.g use `contact.method` instead of `contact.contactMethod`. Keep a qualifier when it distinguishes otherwise ambiguous fields or is required by an externally owned contract.
- Prefix private class members and module-private functions with `_`.
- Keep single-use values and short single-use logic inline. Extract only for real reuse or an independently meaningful contract.
- Use Zod or an authoritative domain library before custom validation. Derive supported values from one source of truth instead of repeating literals.
- Give every authoritative runtime schema its own dedicated `*.schema.ts` file, named for the schema it defines. Do not declare schemas inline in controllers, services, repositories, or utility files.
- For schemas that describe a call contract, include `Input` or `Output` in the schema name and `input` or `output` in its filename to identify the direction relative to the called operation. This applies to API, RPC, and provider calls, including individual items in a response. Internal domain, configuration, state, and transition schemas do not need a directional suffix.
- Inline small nested schemas within their owning schema when they have no independent contract or reuse and are unlikely to be reused. Do not create schema classes or separate schema files solely for those nested shapes. Extract them when they represent an independent validation boundary or have meaningful reuse.
- Name, document, and shape general resource endpoints for the resource they represent, not just the first field or use case they serve. Include only information the endpoint can provide today; add more resource fields as they become supported without redefining the endpoint's purpose.
- Never use a hardcoded single-language fallback, including English, for content a user can see. Prefer a meaningful language-neutral value; otherwise use locale-aware translations or let the client localize an explicit absence.
- Never expose secrets, provider internals, database errors, stack traces, or private identifiers through public responses or logs.

## Validation and Delivery

- Every application and package must independently maintain at least 90% statements, branches, functions, and lines.
- Do not add automated tests for GitHub Actions, workflows, or documentation.
- Run focused tests from the owning workspace. Before handoff, run the root frozen install, lint, typecheck, coverage, build, relevant Wrangler dry runs, relevant OpenTofu checks, and `git diff --check`.
- Before finishing a task, inspect changed code for deprecated APIs against the installed dependency versions, using type-aware diagnostics and authoritative declarations or documentation. Replace deprecated usage with supported alternatives; do not assume a passing typecheck detects deprecation warnings or suppress those warnings to finish the task.
- Select validation and deployment from changed paths, then expand through workspace dependencies. Shared package changes must validate all consumers.
- Infrastructure readiness precedes database migration, and database migration precedes API deployment. Deploy API before a dependent Webhooks or Geosearch Worker.
- Documentation-only and skills-only changes must not deploy runtime applications.
- Keep staging and production credentials environment-scoped. Never weaken OIDC trust, bypass an environment gate, or expose deployment secrets to untrusted pull requests.

### Bug Fixes

Every bug fix must include a regression test.

The regression test must:

- reproduce the bug
- fail before the fix
- pass after the fix
- be named after the scenario

Only skip a regression test if deterministic testing is impossible. If skipped, document why in the code review/commit notes.

## Skills

Skills are available at `.agents/skills/`. Always check available skills before performing actions to ensure you are doing the correct stuff. Never think alone about something if a skill to help you is available.
