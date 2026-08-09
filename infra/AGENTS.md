# AGENTS.md — Cataquí Infrastructure

## Scope

These instructions apply to the infrastructure scope containing this file and supplement the repository root instructions.

## Terraform Type Safety

- Treat Terraform configuration as a compile-time contract. Invalid, incomplete, renamed, or unknown fields must fail `terraform validate`, `terraform test`, or `terraform plan` before an apply can begin.
- Terraform locals cannot declare types. Every structured local that reaches a provider resource must first cross a child-module input with an exact `object`, `map`, `list`, `set`, or primitive type constraint.
- Never use `any` for structured infrastructure configuration. Model every supported field and nested object explicitly.
- Keep required provider fields required. Do not add `optional(...)`, `nullable`, or defaults unless omission is an intentional and documented infrastructure behavior.
- Use the provider's exact attribute names in configuration objects. Do not maintain a second naming vocabulary that can drift from the provider schema.
- Terraform may discard unknown attributes while converting an object to a narrower type. Capture raw keys before conversion and validate the exact supported key set at every object level, including objects nested in lists.
- Correctness guards must block CI. Use input `validation` or resource/module preconditions for invariants; do not rely only on `check` blocks that can continue after a warning.
- Validate provider enums, numeric bounds, formats, and cross-field invariants at the typed module boundary.
- Keep secrets and provider credentials out of Terraform configuration, plans, outputs, and state.

## Safe Extension Contract

Adding, removing, or renaming an infrastructure field must update all of these together:

1. The environment configuration.
2. The typed module input schema.
3. The exact-key shape validation for its object level.
4. The provider resource mapping and any intentional output.
5. Positive tests for supported values and negative tests for drift, unknown fields, and invalid values.

Design modules so a new resource instance is added through one clear registry or module call. Do not duplicate environment routing or resource behavior across unrelated files.

## Verification

Before finishing an infrastructure change, run formatting, initialization, validation, TFLint, and Terraform tests for every affected root module. Then run the repository's lint, typecheck, and test commands. Never apply an unreviewed plan, upload a saved plan as an artifact, or bypass a failing validation.
