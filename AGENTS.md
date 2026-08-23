# AGENTS.md — Cataquí Backend

## Mission and Scope

This repository is the Cataquí backend monorepo. It owns the private user API, provider-ingress and supporting Cloudflare Workers, narrowly scoped runtime contracts, and backend delivery infrastructure. It does not own the admin API or account/zone infrastructure such as DNS, DNSSEC, WAF, bot controls, or zone security.

Cataquí is the real-time opportunity layer of the city. Optimize every product-facing change for fast discovery, low friction, local relevance, freshness, and trust. Do not turn the product into corporate recruiting or staffing software.

## Workspace Ownership

- `apps/api` owns the NestJS application, Prisma schema and migrations, API routing Worker, API container boundary, and API image.
- `apps/workers/*` contains independently deployable Cloudflare Workers. Applications must not import one another.
- `packages/api-internal-ingress` owns only typed private ingress contracts and transport adapters for direct Worker calls and Queue delivery into the API container.
- `packages/microservices-auth-contracts` owns only runtime-neutral JWT and JWKS contracts shared by token issuers and verifiers.
- `infrastructure` owns backend runtime dependencies such as Neon, Upstash, Queues, and AI Gateway delivery.

Cross-workspace behavior must use a named package and its public `package.json` exports. Never use relative imports across workspace boundaries, deep-import another workspace, or create generic `common`, `shared`, or `utils` packages. Keep provider-owned contracts at their integration boundary even when their current fields resemble an owned contract.

## Toolchain

- Use Node.js 24, TypeScript 6, pnpm, Biome, Vitest, and Wrangler.
- Use only the root `pnpm-lock.yaml`; never add npm, Yarn, or Bun lockfiles.
- Add dependencies to the workspace that imports them. Use `workspace:*` for internal packages and the root catalog for genuinely shared versions.
- Every application and package must keep independent `build`, `typecheck`, `test`, `test:cov`, and `clean` scripts.
- Shared packages publish compiled `dist` entrypoints. Build dependencies before consumers with recursive or dependency-aware pnpm filters.
- Do not add Turbo or Nx.

## Shared Engineering Conventions

- Keep code explicit, unsurprising, strictly typed, and locally extensible. Do not use `any`, dead code, speculative abstractions, or broad catch-and-rethrow blocks.
- Prefer guard clauses and exhaustive closed variants. Never add a `default` branch that hides an unhandled enum member.
- Use named object parameters unless every positional value is self-evident at the call site. Spell object keys and values explicitly instead of shorthand.
- Prefix private class members and module-private functions with `_`.
- Keep single-use values and short single-use logic inline. Extract only for real reuse or an independently meaningful contract.
- Use Zod or an authoritative domain library before custom validation. Derive supported values from one source of truth instead of repeating literals.
- Never expose secrets, provider internals, database errors, stack traces, or private identifiers through public responses or logs.

## Validation and Delivery

- Every application and package must independently maintain at least 90% statements, branches, functions, and lines.
- Run focused tests from the owning workspace. Before handoff, run the root frozen install, lint, typecheck, coverage, build, relevant Wrangler dry runs, relevant Terraform checks, and `git diff --check`.
- Select validation and deployment from changed paths, then expand through workspace dependencies. Shared package changes must validate all consumers.
- Infrastructure readiness precedes database migration, and database migration precedes API deployment. Deploy API before a dependent Webhooks or Geosearch Worker.
- Documentation-only and skills-only changes must not deploy runtime applications.
- Keep staging and production credentials environment-scoped. Never weaken OIDC trust, bypass an environment gate, or expose deployment secrets to untrusted pull requests.

## Skills

Keep every skill and its registry ownership at the repository root so the complete backend toolset is available from every workspace. Registry-backed skills live in the root `skills-lock.json` and are restored with the pinned root `pnpm skills:install` command. Keep their root `.agents/skills` installations tracked; `unit-test-writer` remains the documented vendored exception without a registry source.
