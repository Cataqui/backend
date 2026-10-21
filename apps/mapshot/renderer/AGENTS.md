# AGENTS.md — Mapshot Renderer

These instructions apply to `apps/mapshot/renderer/` and supplement the repository, applications, and Mapshot instructions.

## Purpose and Ownership

`mapshot-renderer` is Mapshot's owned Rust renderer for rendering static map snapshots. It turns prepared map and scene inputs into map images, including vector geometry, text shaping and placement, landmark badges and labels, raster composition, and WebP encoding.

Keep rendering behavior and the renderer's binary protocol here. Node.js orchestration, source preparation and storage, container management, and deployment remain in their existing Mapshot owners. Preserve pixel geometry, default label and landmark placement, protocol compatibility with the Node.js caller, and correct resource ownership. Follow the parent Mapshot policy: cache retention budgets may evict data, while arbitrary rendering admission or content-size caps must not reject valid requests.

## Module and Test Organization

- Group code directly by rendering capability, with `mod.rs` entrypoints and private child modules. Expose only the items needed by actual consumers through restricted interfaces; keep this renderer a single binary crate.
- Keep unit tests beside their owner using `#[cfg(test)] mod tests;`: `capability/tests.rs` for an entrypoint or `capability/child/tests.rs` for a child module. Keep fixtures with their owning tests, and avoid `#[path]` overrides.
- Reserve root `tests/` for integration tests that exercise the executable through its native protocol. Do not expose implementation details through a library API solely for tests.
- Split modules around responsibilities and state ownership, not file length. Preserve algorithms and state ownership during structural refactors.

## Required Rust Skills

- Read and apply [`rust-best-practices`](../../../.agents/skills/rust-best-practices/SKILL.md) before writing, reviewing, refactoring, or optimizing Rust code. Consult its relevant reference chapters for ownership, borrowing, error handling, performance, and documentation.
- Read and apply [`rust-testing`](../../../.agents/skills/rust-testing/SKILL.md) when adding or changing Rust behavior and tests. Use its test-first workflow, scenario-based names, independent fixtures, and behavior-focused assertions, including error paths.
- Repository and Mapshot instructions take precedence over generic skill examples, including the requirement for at least 90% coverage in statements, branches, functions, and lines. Adopt dependencies and testing tools only when the current use case needs them.
