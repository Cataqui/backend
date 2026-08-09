# Cloudflare Queue Instructions

These instructions apply to every Queue implementation in this scope and supplement the repository-root and Cloudflare platform instructions.

## Shared Queue Contracts

- Keep one authoritative Queue manifest for supported Queue base names and their Zod message schemas.
- Derive `QueueName`, Worker delivery paths, and NestJS consumer route types from that manifest. Never repeat a Queue endpoint separately in Worker and NestJS code.
- Name NestJS Queue-consumer controller files `*.queue.controller.ts` and their colocated tests `*.queue.controller.spec.ts`. Mark those controllers with `@QueueController()` and their methods with `@QueueConsumer(...)`. The Queue name passed to `@QueueConsumer(...)` must use the `QueueName` union derived from the manifest.
- Keep each Queue consumer in the feature module that owns its business operation. Do not create one application-wide controller that injects services from unrelated features.
- Keep Queue constants only for values shared by multiple production consumers that cannot be derived from the Queue manifest. Container outbound virtual hosts belong to the container outbound manifest, not to Queue constants. Do not create constants merely to name a one-off implementation detail.
- Tests may assert literal expected paths and Queue names when their purpose is to detect accidental contract changes. Avoid deriving both implementation and expectation from the same declaration when that would make the test tautological.
