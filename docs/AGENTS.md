# AGENTS.md — Documentation

These instructions supplement the repository root instructions for `docs`.

## Purpose and ownership

This folder owns general backend documentation, architecture explanations, and operational runbooks that span applications, packages, or infrastructure. Keep workspace-specific guidance with its owning workspace and endpoint/request details in Swagger or OpenAPI.

## One authoritative place per topic

- Document each procedure, requirement, or explanation in one authoritative place. Do not replicate the same content across documents.
- Before adding documentation, check whether an existing document already owns the topic. Update that document instead of creating a competing explanation.
- Other documents may briefly explain why the topic matters in their context and link to the authoritative document or section. Do not copy its steps, configuration tables, or requirements.
- Keep each document focused on its own purpose. When it depends on prerequisites, setup, or procedures owned by another document, link to that document instead of repeating its instructions.
- When moving a topic, remove the old duplicate and update references so readers can find the complete instructions in one place.

## Deployment documentation

- Include only actions operators must perform and information they need to deploy safely, such as prerequisites, verification, limitations, and recovery steps.
- Do not explain how automated deployment internals work. Keep architectural and implementation explanations in their owning documentation and reference them only when needed for an operational decision.
- Omit component-specific deployment sections when there is no manual action or operational information the reader needs to know. Do not describe an automated component merely because it participates in deployment.
