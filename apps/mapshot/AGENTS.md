# AGENTS.md — Mapshot

## Build and Generated Data Contracts

- When changing production code, check which build and generation commands depend on its contracts, including readers, schemas, asset formats, styles, configuration, and source identities. Keep affected producers aligned in the same change, and add or update compatibility tests when those contracts change so generated artifacts continue to match what production consumes.
- Prove generator and consumer compatibility in tests using actual generator output and the production reader or authoritative schema. Cover meaningful format boundaries and keep this proof with the owning generator; do not instantiate runtime services or reopen and decode freshly generated output in build commands solely to check our implementation's correctness.
- Build commands may reuse pure application-owned schemas, types, format primitives, and style definitions required to produce artifacts. Keep those contracts authoritative instead of copying them into build code. Keep runtime application startup, DI, RPC connections, query services, and lifecycle management out of build commands.
- Preserve validation of external source data, downloaded artifact integrity and identity, I/O completion, cancellation, and atomic publication at their owning boundaries. Tests establish our producer's correctness; they do not validate external data or protect artifacts during transfer and storage.

## Rendering Ownership

Mapshot is a general map snapshot renderer used by higher-level applications. Its callers choose the camera, zoom and viewport they need. Maps owns its public presets and product restrictions; those choices must not become Mapshot's rendering limits.

- Accept valid rendering requests independently of today's callers. Do not fix a zoom, impose a viewport or pixel-count ceiling, reject larger images or source resources, or silently omit otherwise valid data because of arbitrary byte, record, candidate or query-area caps.
- Validate actual input and format invariants at their owning boundaries: finite and representable arithmetic, positive integer dimensions, geographic projection rules, external data structure and integrity, and constraints imposed by the supported encoder or provider. A value being larger than today's data or viewport is not an invalid state.
- Keep current visual defaults, including 2× pixel density, cartographic styling and final landmark placement counts. These are rendering defaults, not grounds for restricting accepted camera or viewport values.
- Callers own request deadlines and cancellation policy. Propagate cancellation through queued work, source reads and the renderer. Do not impose another fixed render deadline or reject queued requests merely because a caller exceeds today's traffic assumptions. Preserve serialization required by the native process and correct shutdown and draining.
- Cache budgets may evict or skip retaining reusable data; they must not reject valid work or truncate its result. Prefer backpressure and processing in batches to content-size rejection. An oversized valid item can be processed without being retained in a cache.
- Preserve real startup, shutdown, framing, allocation and provider integration guarantees. Keep each guarantee at one owner, and distinguish actual format or numeric constraints from a chosen application quota. Do not invent fixed limits under the name of safety.
- When a transport has a real payload constraint, use its supported streaming facilities where applicable instead of introducing a smaller application-level image cap. Explain any unavoidable format or platform limitation to the human.
