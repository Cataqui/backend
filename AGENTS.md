# AGENTS.md — Cataquí Backend

## Mission and Scope

This repository is the Cataquí backend monorepo. It owns the APIs and backend infraestructure needed to run Cataquí as the best way as possible.

Cataquí is the real-time gig/freelance layer of the city, containing all the local opportunities in a single app, making it easy to discover jobs/gigs/freelance and make fast local money. Optimize every product-facing change for fast discovery, low friction, local relevance, freshness, and trust. Do not turn the product into corporate recruiting or staffing software.

## Workspace Ownership


- `apps/api` owns the NestJS application, Prisma schema and migrations, API routing Worker, API container boundary, and API image. This API is the main orchestrator and main entry point for most things related directly to what Cataquí is. This own the core of cataqui, things like posting jobs, getting feed, etc. 
- `apps/mapshot` owns static map image generation. Its role is to take a location and generate a map image showing that location
- `apps/workers/auth` owns authentication infraestructure
- `apps/workers/*` contains independently deployable Cloudflare Workers microservices. These are made to not stress the main API over stuff that can be independently managed and are not core to Cataquí. Things such as webhook services, Address searching services and non critical services should have a worker instead of being embedded in the main API.
- `packages/*` owns code and contracts actually shared by multiple applications in this monorepo. Create a package only when multiple apps need the same owned capability or contract. Keep app-internal code, formats, readers, and helpers inside the owning app, even when multiple runtimes or modules within that app use them. Do not create packages for hypothetical future consumers.
- `infrastructure` owns the whole infrastructure for running all Cataquí products, including the complete `cataqui.com` Cloudflare zone: DNS, DNSSEC, WAF, bot management, rate limits, and zone settings.

Cross-workspace behavior must use a named package and its public `package.json` exports, except for the configuration-only Worker references described below. Otherwise, never use relative imports across workspace boundaries or deep-import another workspace, or create generic `common`, `shared`, or `utils` packages. Keep provider-owned contracts at their integration boundary even when their current fields resemble an owned contract.

### Application Boundaries

- Treat each application as a bounded ecosystem. Its Worker, container, and application-owned workerhole (if any) workspace belong to that ecosystem; they must not import another application's code, types, schemas, or portal definitions, including through that application's public package exports. This applies to tests and build dependencies as well as runtime code. The sole configuration exception permits named Worker-definition imports between `cloudflare.config.ts` files for native Cloudflare binding inference. Such definitions must contain only credential-independent Worker identity, typed entrypoint, and export declarations. Do not import another application’s deployment factory or use this exception in application/runtime code.
- Communication between an application's Worker and container goes through its own portal definitions. Neither side may import the other's runtime code or types; keep their shared call inputs, outputs, and runtime-neutral contracts in that application's workerhole workspace. Define the portal's types locally rather than importing or deriving them from another Worker or container. Workerhole workspaces own the connection contract, not another application's capabilities or implementation.
- Call other applications through explicit transport boundaries such as typed Service Bindings. Keep caller-owned integration types local and map each input and output field explicitly at the boundary. Native Cloudflare binding inference may reference target entrypoints through the configuration-only definitions above; this does not authorize runtime imports or leaking target-owned types into local contracts.
- Share code between applications only through a narrowly owned package under `packages/` when it is genuinely a shared capability or contract. Never use another application's workspace, including its workerhole workspace, as a shared package.

## Instruction Scope

Before changing a file, check its directory and parent directories for nested `AGENTS.md` files. Apply every applicable instruction; when instructions conflict, the `AGENTS.md` closest to the file being changed takes precedence over parent guidance.

## Human Communication and Decisions

- Explain consequential implementation choices to the human, including what changed, why, and any limitations, unsupported scenarios, manual requirements, or failure behavior. Raise these during the work and include unresolved limitations in the handoff; writing them only in documentation is not sufficient.
- Do not silently narrow the agreed scope or introduce operational restrictions. When a choice changes expected behavior, deployment safety, rollback support, or required manual work and the human has not already chosen that tradeoff, explain the alternatives and ask what to do before implementing the dependent change. Routine implementation details within the agreed scope do not require repeated approval.
- For example, a deployment flow that supports an initial Durable Object migration but fails on later migrations must be explicitly discussed. Do not present that flow as complete without explaining the unsupported case and agreeing on its handling.

## Documentation

- Give JSON operations a representative request-body example when applicable and a success example for each response shape. Use named examples for meaningful outcomes such as pending versus completed or populated versus empty; omit payload examples for empty and binary responses. Include provider webhook payloads, but do not create OpenAPI documentation for private RPC solely to add examples.
- Keep complete operation payload examples beside the owning transport documentation. Keep reusable field examples in schema metadata. Extract feature-owned example files only for substantial fixtures or actual reuse; do not introduce a repository-wide example registry or duplicate schema definitions.
- Check every authored request example with `satisfies z.input<typeof InputSchema>` and every response example with `satisfies z.output<typeof OutputSchema>`, including values inside named examples and schema metadata. Use existing inferred contracts when no runtime schema exists. Never use assertions, `any`, or unchecked wrappers to bypass example typing. Shape mistakes must fail the existing typecheck; formats, refinements, status/code consistency, and scenario realism remain author and reviewer responsibilities. Do not add example-specific CI checks or runtime startup validation.
- Use synthetic, coherent example data and named error-code members. Reuse application-owned error examples, specializing the endpoint, HTTP status, code, message, and violations for operation-specific corrective actions. Never use real credentials, personal data, private identifiers, or provider diagnostics in examples.

- Keep API specifications and documentation private. Serve OpenAPI documents, Swagger UI, and equivalent documentation endpoints only in explicit local development mode; staging, production, and missing or unsupported environments must not expose them anonymously. Do not deploy development configurations as public documentation hosts.
- Preserve authoritative schemas, route metadata, and local specification generation. Any future hosted documentation must require team authorization; an ordinary Cataquí account or user session does not grant documentation access. Do not enable hosted documentation without implementing that access boundary.

- Do not add TSDoc documentation comments; this repository is private.

- Keep READMEs focused on general project context, purpose, high-level architecture, prerequisites, setup, and basic development commands.
- Do not append every feature change or explain each subsystem's internal behavior in a README. Avoid detailed request flows, implementation walkthroughs, and duplicated API contracts.
- Document success responses and actionable, operation-specific errors explicitly in OpenAPI. Do not enumerate generic HTTP errors such as 400, 401, 500, or 503 on every route merely to repeat their standard meanings. Reuse the owning application error contract through a `default` response for remaining errors. Keep explicit statuses when they describe a distinct failure condition, required client action, response header, or payload, and explain that behavior rather than restating the HTTP status name.
- Put endpoint details in the owning Swagger/OpenAPI documentation and deeper architecture or operational procedures in focused documentation or runbooks. Link to those sources from the README when useful.
- Keep infrastructure bootstrap documentation focused only on required manual actions that are not automated. Give actionable guidance for those steps; omit explanations of how automated bootstrap, provisioning, or reconciliation works.

## Toolchain

- Node.js 24, TypeScript 6, Ruby pinned by `.ruby-version`, Bundler, pnpm, Biome, Vitest, Wrangler and OpenTofu for infrastructure setup.
- Before writing custom automation, check the provider's current supported GitHub Actions, CLI commands, structured outputs, and SDKs. Use supported provider functionality whenever it satisfies the requirement, and prefer its structured outputs. Write custom automation only for a strictly necessary gap with no supported alternative, document that gap beside the script, and keep the custom code limited to it.
- Use Ruby for custom automation, including infrastructure bootstrap, deployment/recovery, CI logic, maintenance, and command orchestration. Do not introduce or retain raw Bash, JavaScript, or TypeScript automation when Ruby can own the operation. Pin Ruby in `.ruby-version`, declare gems in the root `Gemfile`, commit `Gemfile.lock`, and run gem-dependent commands through Bundler. Keep short, single-use Ruby inline in the owning action or workflow with `shell: ruby {0}`; direct provider/tool commands may remain ordinary command steps without custom shell logic.
- Keep application/runtime code and specialized compiler, bundler, or map-data libraries in their owning implementation language. Keep tool configuration in the format required by that tool. A narrow adapter may invoke a required Node-only SDK or expose an existing application-owned build/data library to Ruby; document that dependency, keep orchestration in Ruby, and do not use an adapter merely to keep old custom scripts running.
- Keep narrow operations with one caller inline in the owning workflow, action, or script; do not create a separate script file merely to name a step or wrap another script. Extract scripts only for actual reuse, substantial logic, or independently useful operational commands. Keep each extracted script focused on one responsibility rather than unrelated phases or operations. Keep callers focused on orchestration, with distinct steps for operations such as planning, applying, checking health, and restoring a version, and keep tightly related resource cleanup with the operation that owns it.
- Name each script and its calling step for its specific role or observable outcome, such as `get-worker-version.rb`, `check-api-health.rb`, or `restore-worker-version.rb`. Avoid vague lifecycle names such as `prepare.rb`, `run.rb`, or `process.rb`. If a script's responsibilities cannot be described by one clear name, split it into scoped scripts rather than giving it a generic name.
- Keep every GitHub Action and workflow under `.github`; never place action metadata or workflow files beside application, package, or infrastructure source code.
- Only the root `pnpm-lock.yaml`; never add npm, Yarn, or Bun lockfiles.
- Add dependencies to the workspace that imports them. Use `workspace:*` for internal packages and the root catalog for genuinely shared versions.
- Every application and package must keep independent `build`, `typecheck`, `test`, `test:cov`, and `clean` scripts.
- Shared packages publish compiled `dist` entrypoints. Build dependencies before consumers with recursive or dependency-aware pnpm filters.
- Do not add Turbo or Nx.

## Local Environment Ownership

- Each application owns its local `.env` and committed `.env.example`. Do not load a repository-root environment file or another application's file.
- A Worker/container application uses one environment file at the application root; its nested Worker commands explicitly select that file. Independently deployed Workers keep the files in their own application directory.
- Keep only the owning application's values in each file. Runtime secret delivery remains scoped through Infisical profiles; migration and release credentials must not be forwarded to runtime consumers.
- Generate Wrangler types from declared bindings and required secrets without depending on local secret files or environment examples.

## Layer Responsibilities

- Repositories execute database and storage operations, provider calls, and infrastructure-binding operations. Prefer repository-owned return types containing the raw operation result and outcome information the service needs, rather than exposing provider response envelopes. Keep the machinery of a single I/O operation inside its repository method: select the called source, construct provider requests, select the requested result, and map provider fields into the owned contract. For example, `inferNameMeaning` selects the model and completion and returns its raw generated content and finish reason; the service does not navigate Cloudflare's completion envelope. Preserve missing, incomplete, and failed outcomes so services can interpret them. Do not apply business rules, validate application expectations, or translate provider failures into application errors. Let provider failures reach the calling service. Do not construct public HTTP responses or choose their status codes and headers.
- Services own business rules, orchestration, and interpretation of repository results. Validate results against the operation's requirements, decide what missing or conflicting results mean, and throw meaningful application errors for expected failures. Validate input rules that depend on database state, lifecycle state, another service, or a provider response. Coordinate repositories and other owned services, and return transport-independent data or outcomes. Access providers and storage through repositories. Keep services independent of HTTP responses, request contexts, and presentation formatting. Durable Object coordinators follow the same separation for their RPC results.
- Input schemas validate every rule decidable from the input alone, including field formats, conditional required fields, relationships between fields, and other self-contained invariants. Validate these schemas at ingress; do not repeat their rules in services or repositories. Output schemas define and serialize the public contract; they do not contain business rules. Services interpret repository-owned results against the operation's requirements and validate external content not covered by the provider's SDK or native binding contract.
- Services own operation-level cancellation and deadline policy. Repositories may forward a supplied signal to the provider and perform resource cleanup required by their I/O, including discarding a response that arrives after cancellation. Such cleanup is part of executing the I/O safely, not an application validation policy. Keep stream and transport cancellation with their owning transport rather than repeating it in services or repositories.
- Keep each service exclusively focused on the capability it owns. A service that supplies one part of a larger result must return that part; the service owning the complete result coordinates its contributors. Prefer the existing calling service when that orchestration belongs to its capability, and introduce another service only when the responsibility has an independently meaningful owner. For example, a pricing service calculates a price; the checkout service coordinates pricing, payment, and order creation. Do not make the pricing service own the entire checkout merely because checkout needs a price.
- Keep service-owned logic with a single production consumer inside that service, inline in the owning public method. Extract a private helper only when production code uses it in multiple places within the same file; do not extract business rules or orchestration merely to shorten the method or test the helper separately. Test the behavior through the service's public methods. Extract separate components only when they have real reuse or own an independent boundary or contract, such as a provider integration or runtime schema.
- Controllers, routes, RPC entrypoints, and response adapters own the transport contract: request parsing and validation, authentication at ingress, status codes, response headers, serialization, and error presentation. Call services for application behavior; do not perform storage queries or provider operations directly.
- Provider-specific transport mechanisms remain at their integration boundary. A repository may use HTTP to call an external provider, pass native conditional-read headers to storage, or persist storage metadata; this does not make it responsible for the application's public HTTP response. Keep shared representation and cache policy in explicitly owned feature contracts rather than importing a response adapter into a repository.

## Shared Engineering Conventions

- Organize configuration by its owning domain in a `*.config.ts` file, exposing a domain-named config object such as `DatabaseConfig` with named fields. Keep related settings together, even when the domain currently has only one setting; do not create separate configuration tokens or files for individual primitive values. Add fields only when current behavior needs them.
- Organize Prisma schemas as multiple files in the owning application’s `prisma/schema/` directory: one model per file named after the model in kebab-case, all enums in `enums.prisma`, and datasource and generator blocks in `base.prisma`. Configure Prisma to load the schema directory.
- Prefer generic recursive patterns and convention-based discovery over lists of application or directory paths when the same rule applies across the repository. New matching files and locations should work without updating a central list. Keep path-specific rules only for actual differences in behavior; remove unnecessary global exclusions instead of adding per-application exceptions.
- Implement only what the current use case requires, using the minimum features, configuration, and abstractions needed to satisfy it. Do not add support for hypothetical future requirements. Reconsider and extend the design when those requirements become current.
- Keep only data and abstractions that enable current feature behavior, a required contract, or a concrete operational need. Do not add or retain metadata, `info` payloads, descriptive names, aliases, fields, configuration, or wrappers without identifying the consumer and the behavior or decision they enable. Generating, forwarding, echoing, or asserting a value in tests does not by itself justify it. Prefer the actual resource, file, type, or primitive when another descriptive layer adds nothing. Preserve metadata with an established role in integrity, compatibility, security, lifecycle, or actionable diagnostics at its owning boundary.
- Keep safeguards proportionate to failures that can realistically occur in the current architecture and workload. A theoretically possible failure is not sufficient justification for extra validation, queues, limits, retries, fallback paths, or recovery machinery. Establish a credible trigger and meaningful impact, using caller behavior, platform guarantees, incident evidence, or measurements as appropriate. Prefer the simpler implementation when the scenario requires implausible scale, impossible owned states, or negligible probabilities such as a secure cryptographic identity collision; rely on the authoritative primitive instead of adding another collision defense. For example, do not add a second source-read admission queue when the renderer already controls normal read concurrency and measurements show no resource pressure. Preserve proportionate controls for credible external-input, security, data-loss, resource, and lifecycle failures; rarity alone does not make a consequential failure unrealistic.
- Keep code explicit, unsurprising, strictly typed, and locally extensible. Do not use `any`, dead code, speculative abstractions, or broad catch-and-rethrow blocks.
- Use the existing type or class directly for dependencies. Use `Pick` only when deliberately restricting the available members serves a concrete contract or capability boundary; using only a few methods or making test doubles smaller is not sufficient reason. For class-based dependency injection, prefer inferred class injection when supported, and retain explicit injection tokens for interfaces, configuration, or ambiguous runtime types.
- Name cross-module dependencies for both their capability and role, such as `mapService`, `authRepository`, or `billingController`. Role-only names such as `service`, `repository`, or `controller` are allowed only when the dependency belongs to the same feature module and its identity is clear from that context; for example, `MapService` may name its `MapRepository` dependency `repository`. Apply this to dependency parameters and fields, whether injected or passed explicitly.
- Require explicit parameter and return types for functions and methods in every language, including private functions, local helpers, and standalone function expressions. Use the language's supported type annotations or signature declarations. Contextually typed callbacks may inherit their parameter and return types from the declared contract. Preserve language-defined implicit return types when omission unambiguously specifies the type, such as Rust's unit (`()`) return. Prefer inferred types for variables and constants where supported; annotate only when needed to establish an intended type that inference cannot express. Keep fixtures checked against their contracts as required by the testing conventions below.
- Give each function or method one clear role, and make its name, side effects, and return value match that role. Return only results that belong to the operation; do not turn lifecycle methods into resource accessors merely because callers need the resource afterward. Methods such as `start` or `ensureReady` should return `void` or `Promise<void>` when their role is to establish state; callers access the established resource separately. Setup steps needed to fulfill that role may remain inside the method.

  Bad: starting also acts as a channel accessor.

  ```ts
  async start(): Promise<Channel> {
    this._channel = createChannel();
    await this._startProcess();
    return this._channel;
  }
  ```

  Good: starting establishes state and reports completion.

  ```ts
  async start(): Promise<void> {
    this._channel = createChannel();
    await this._startProcess();
  }
  ```

- Add checks, parsing, and validation only when they address a concrete failure that matters to the operation. Do not add a second mechanism merely to detect a failure that existing parsing or validation already detects; for example, do not add a protocol-version handshake when response parsing already rejects incompatible formats and no separate compatibility requirement exists.
- Treat communication between components we own and trust as a trusted contract. Do not add validation complexity for hypothetical malicious internal producers or rare producer bugs, or duplicate checks already handled by standard parsing; for example, parse a small internal JSON response with `response.json()` instead of checking its content-type first or writing a custom size-limited reader. Cover the producer's contract with unit tests. Keep checks with a concrete operational purpose, such as readiness, binary framing, deadlines, and limits for large resources.
- Validate output guarantees once, at their owning producer or integration boundary. Downstream components must trust outputs already validated by an owned, trusted component and consume their typed contracts directly. Do not repeat schema parsing, size or range checks, dimension checks, or digest verification for guarantees already established upstream. Required serialization parsing is not revalidation. Keep checks for distinct operational or lifecycle concerns that upstream validation does not cover, and test each guarantee at its owning boundary. This does not exempt external data that has merely been forwarded without validation.
- Give each invariant and operational guarantee one explicit owner across all code, including application code, scripts, workflows, builds, and infrastructure. Before adding validation, limits, queues, retries, synchronization, or lifecycle and recovery checks, trace what the caller, producer, dependency, or platform already guarantees. Consume established guarantees instead of independently enforcing them again downstream; each additional control must address a distinct concrete failure or resource boundary. Before removing a control, verify that the owning guarantee covers parallel calls, cancellation and draining, restarts, deployment, and rollback where relevant. Trust alone does not establish bounded concurrency, completed work, or immutable storage. Test the guarantee at its owner and preserve validation at external boundaries.
- Give each operation's deadline one owner. Do not add a local timeout when an existing caller or dependency deadline already bounds the same work, including stream consumption and cleanup. Propagate the existing cancellation signal instead. Add a separate timeout only for a distinct concrete operation or lifecycle boundary that the existing deadline does not cover.
- Across all code, trust outputs typed by supported third-party libraries, SDKs, and native platform bindings. Consume those typed contracts directly; do not duplicate them in runtime schemas or defensively revalidate their field types. Check operation-specific requirements at their owning boundary, such as a completed generation, an available result, or a permitted lifecycle state. Validate opaque or user-controlled content carried inside typed outputs, such as model-generated JSON, against the owning application schema. A handwritten type annotation or assertion on raw HTTP JSON does not establish a third-party library, SDK, or binding contract.
- Always treat caller input, raw third-party payloads without an authoritative typed library, SDK, or native binding contract, and opaque externally supplied content as untrusted. Validate them at the boundary where they enter the system, using authoritative schemas or domain libraries; forwarding through an owned component does not establish those guarantees, and tests do not replace ingress validation.
- Do not write `if / else if / else` chains or nest conditionals to disguise the same chain. Chains usually indicate that decisions or responsibilities need clearer organization. Prefer guard clauses with early `return`, `continue`, or `break`, exhaustive matching on actual variants, direct lookups, or a clearer separation of responsibilities. Do not mechanically replace a chain with a boolean match, nested ternaries, or single-use helpers. Keep simple two-way conditionals when they express the decision clearly, and omit `else` after a branch that exits. Never add a `default` branch that hides an unhandled enum member.
- When a comparison or condition expresses a domain or lifecycle meaning that is not obvious from its operands, assign it to a local boolean named for that meaning before using it in control flow. Apply this even to single-use conditions; keep self-evident comparisons inline.

  Bad: the comparison hides why destruction is safe.

  ```ts
  if (this._successfulRenderRevision === successfulRenderRevision) {
    this.#_destroyUnhealthyContainer();
  }
  ```

  Good: the variable explains what the comparison establishes.

  ```ts
  const noRenderSucceededDuringCheck = this._successfulRenderRevision === successfulRenderRevision;
  if (noRenderSucceededDuringCheck) {
    this.#_destroyUnhealthyContainer();
  }
  ```

  These examples isolate one condition; retain the other lifecycle guards required by the operation.
- Use named object parameters unless every positional value is self-evident at the call site. Spell object keys and values explicitly instead of shorthand.
- When source and destination inputs use independently defined types, map each field explicitly even when their properties match. Do not forward the whole object or spread it into the destination input; pass it directly only when both sides intentionally reuse the same input contract.
- Name fields relative to their containing object. Avoid repeating the object's name when the context already makes it clear: e.g use `contact.method` instead of `contact.contactMethod`. Keep a qualifier when it distinguishes otherwise ambiguous fields or is required by an externally owned contract.
- Name Cloudflare resource bindings relative to their owning application. Use short, unambiguous names such as `R2` for its sole R2 bucket; do not repeat the owning application name. Add capability-specific qualifiers when multiple resources of the same kind need to be distinguished. Cross-application Service bindings identify the target application or capability. Keep exported class names descriptive and deployed resource names descriptive and environment-specific; local binding names are separate from those identities.
- Access an owning Worker’s container namespaces through `ctx.exports`; do not add an explicit environment binding solely to access its own container. Preserve container exports and storage identities. Use generated export types directly, adding a narrow local assertion only when cross-Worker type inference checks the implementation against the caller’s global exports. Keep callback portal lookup inside Workerhole.
- Prefix private class members and module-private functions with `_`.
- Keep single-use values and short single-use logic inline. Extract only for real reuse or an independently meaningful contract.
- Define types used in only one place inline at that use site, including parameter and return types. Do not introduce or export a named type alias or interface solely to name a single-use shape; extract a named type when multiple production use sites actually reuse it.
- Extract private functions or methods only when they have multiple production use sites within the same file. Otherwise keep the implementation in the owning public method, including its existing operation callback or loop when appropriate. Do not introduce a single-use local function, closure, helper file, or wrapper merely to move that implementation elsewhere. Test-only calls do not establish production reuse. Preserve functions required by a language, framework, trait, or callback contract, and keep genuinely public integration boundaries public.
- Choose value scope in this order: inline → function-local variable → static/class or module variable. Keep a value inline when it is used in only one place; do not extract it to a static/class variable or constant. Use a function-local variable when the value is reused within that function or method, and widen its scope only when it is actually shared across consumers. The named-boolean rule above still applies to conditions with non-obvious domain or lifecycle meaning. Test behavior at the consumer instead of creating and testing a constant solely for a single call site.
- Use Zod or an authoritative domain library before custom validation. Derive supported values from one source of truth instead of repeating literals.
- Name dedicated mapper files `*.mapper.ts` after the concept they map, such as `place-category.mapper.[file_extension]`.
- Give every authoritative runtime schema its own dedicated `*.schema.ts` file, named for the schema it defines. Do not declare schemas inline in controllers, services, repositories, or utility files.
- For schemas that describe a call contract, include `Input` or `Output` in the schema name and `input` or `output` in its filename to identify the direction relative to the called operation. This applies to API, RPC, and provider calls, including individual items in a response. Internal domain, configuration, state, and transition schemas do not need a directional suffix.
- Inline small nested schemas within their owning schema when they have no independent contract or reuse and are unlikely to be reused. Do not create schema classes or separate schema files solely for those nested shapes. Extract them when they represent an independent validation boundary or have meaningful reuse.
- Name, document, and shape general resource endpoints for the resource they represent, not just the first field or use case they serve. Include only information the endpoint can provide today; add more resource fields as they become supported without redefining the endpoint's purpose.
- Never use a hardcoded single-language fallback, including English, for content a user can see. Prefer a meaningful language-neutral value; otherwise use locale-aware translations or let the client localize an explicit absence.
- Never expose secrets, provider internals, database errors, stack traces, or private identifiers through public responses or logs.
- Use UPPERCASE string values for TypeScript enums and enum-style `as const` objects, with underscores between words (for example, `INVALID_INPUT`).
- Define owned error codes with an enum or an enum-style `as const` object and derive the code type from that definition. Use its named members when constructing or handling errors instead of raw string literals or independently declared string unions. This also applies to error discriminants named `reason` or `failure`.
- Throw meaningful errors whose types, codes, and messages identify the operation and failure that actually occurred. Reuse an appropriate owned error or create one when callers need a distinct failure; use precise standard error subclasses such as `TypeError` or `RangeError` for invalid arguments. In the owning implementation, never substitute a generic availability or failure error for known validation, capacity, response-format, or lifecycle failures, or reuse an unrelated error merely because it is available. Preserve known errors through internal catch blocks; perform intentional public-contract translation and sanitization only at the owning transport boundary.
- Keep application error base classes such as `AppError` abstract and never instantiate them directly. Each concrete error subclass must represent one specific failure and own its fixed code and message. Do not accept caller-supplied messages, codes, or selectors that turn one error class into multiple unrelated failures. Production call sites instantiate the appropriate specific subclass without defining error messages; for example, throw `new RendererRejectedError()` rather than `new RendererProcessError({ message: "Renderer rejected the requested operation." })`. Keep messages for explicit standard errors in specific subclasses as well.
- Always use an application-owned schema created with `createErrorResponseSchema` from `@cataqui/response` to define and serialize application-owned HTTP error responses, including middleware, routing errors, and provider webhooks. Keep the body’s `status` equal to the actual HTTP response status.

## Validation and Delivery

- Every application and package must independently maintain at least 90% statements, branches, functions, and lines.
- Do not add automated tests for GitHub Actions, workflows, or documentation.
- Before adding or retaining a production property, parameter, constructor option, or injection token solely to make a test reach a scenario, trace its production callers and evaluate whether the test can exercise the real production path instead. Use the values and limits production actually uses, and drive the implementation to the relevant boundary through its public API. Control real dependencies through stubs, mocks, existing dependency injection, clocks, or environment controls; do not replace the behavior under test or introduce a different configuration merely to make the test smaller or easier. Keep configuration and dependency parameters that serve a concrete production requirement. If the real path is impractical or nondeterministic, first look for a suitable existing dependency boundary rather than adding a test-only control.

  For example, if Mapshot allows one active render and eight queued renders, hold the renderer dependency pending, submit nine accepted requests, and verify that the tenth is rejected. Do not add or retain a `maximumQueuedRenders` override, options wrapper, or DI token solely so a test can lower that limit to zero or one. Test the production limit and its recovery behavior.

- Test only the behavior owned by the implementation under test. Consumer tests stop at the dependency's public boundary: verify configuration, method calls and arguments, and the consumer's handling of results, failures, cancellation signals, and cleanup. Mock that public API instead of recreating the dependency's transport or importing its implementation details. The dependency's own suite is responsible for proving that its methods execute, deliver, serialize, stream, cancel, reconnect, or otherwise fulfill their contract. Do not repeat that proof in consuming applications, including in integration or smoke tests. Apply the same boundary to packages that consume other packages.

  Bad: Mapshot constructs a Cap'n Web client to prove that `workerhole` delivers a render call or cancellation.

  Good: Mapshot verifies that it registers the right portal, invokes the channel with the right input/options, and forwards the received signal to its renderer. `workerhole` tests real connections and cancellation delivery; Mapshot tests its own rendering and shutdown behavior directly.

- Keep tests with the code they validate: colocate them with the implementation or use a test directory inside the owning application, package, or infrastructure component. Reserve root tests for repository-wide contracts; do not group component tests at root by implementation language. Keep test helpers and fixtures in the same owning boundary. Root runners may discover and execute these local suites.
- Run focused tests from the owning workspace. Before handoff, run the root frozen install, lint, typecheck, coverage, build, relevant Wrangler dry runs, relevant OpenTofu checks, and `git diff --check`.
- Before finishing a task, inspect changed code for deprecated APIs against the installed dependency versions, using type-aware diagnostics and authoritative declarations or documentation. Replace deprecated usage with supported alternatives; do not assume a passing typecheck detects deprecation warnings or suppress those warnings to finish the task.
- Select validation and deployment from changed paths, then expand through workspace dependencies. Shared package changes must validate all consumers.
- Infrastructure readiness precedes database migrations. Deploy Auth before consumers, Mapshot before Maps, and Maps before API. Keep infrastructure provisioning separate from application deployment.
- Documentation-only and skills-only changes must not deploy runtime applications.
- Keep staging and production credentials environment-scoped. Never weaken OIDC trust, bypass an environment gate, or expose deployment secrets to untrusted pull requests.

### TypeScript Test Doubles

- Use Testdouble for TypeScript dependency mocks, stubs, test callbacks, replacements, and interaction verification. Import it as `import * as td from "testdouble"`; prefer `td.object<Dependency>()`, `td.func<FunctionType>()`, `td.when`, and `td.verify`.
- Keep Vitest for the runner, assertions, coverage, module interception and hoisting, clocks, and environment controls. Module factories should export Testdouble doubles. Retain `vi.spyOn` only for transparent call-through observation and getter/setter spies; do not use ordinary `vi.fn` or stubbed method spies.
- Reset Testdouble after every test. Register its cleanup before other test cleanup so pending work and owned resources are drained first. Reconfigure shared wiring before each test and configure scenario-specific responses inside the test.
- Keep response fixtures explicitly typed or checked with `satisfies`, and give custom callbacks explicit argument and return types. Do not weaken production contracts or introduce dependency casts solely to accommodate mocks.
- Preserve meaningful stateful fakes and real integration resources. Testdouble replaces dependency operations; it must not replace the stream, process, transport, data, or lifecycle behavior the test owns. Preserve call-through behavior, finite responses, cancellation, operation ordering, and pending-work cleanup when migrating tests.
- Keep large binary buffers in typed stateful fixture methods when recording them through Testdouble would clone the payload; record only the metadata needed for assertions.
- Verify interactions with Testdouble. Avoid redundant verification of a configured invocation; use call records when the interaction itself is the guarantee under test. Treat `td.verify` as an assertion when applying an owning workspace's assertion conventions.

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
