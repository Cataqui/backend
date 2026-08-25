# Cataquí Backend

This repository contains the backend applications, shared packages, and infrastructure that power Cataquí—the real-time layer for discovering local jobs, gigs, and freelance opportunities.

It is a pnpm monorepo built around a main NestJS API, independently deployable Cloudflare Workers, shared TypeScript packages, and OpenTofu-managed infrastructure.

## Structure

```text
apps/
├── api/                 Main NestJS API and Cloudflare container gateway
└── workers/             Cloudflare workers for specific tasks 

packages/                Shared TypeScript packages

infrastructure/
├── bootstrap/           Infrastructure bootstrap and reconciliation scripts
└── opentofu/            Environment and platform infrastructure definitions

test/                     Repository-level tests
```
