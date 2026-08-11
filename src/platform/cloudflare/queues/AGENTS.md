# Cloudflare Queue Instructions

These instructions apply to every Queue implementation in this scope and supplement the repository-root and Cloudflare platform instructions.

## Shared Queue Contracts

- Keep one authoritative Queue manifest for supported Queue base names and their typed inbound receivers.
- Derive `QueueName` from the Queue manifest, and derive message validation and container delivery paths from the receiver registered in the inbound manifest. Never repeat a Queue endpoint separately in Worker and NestJS code.
- Deliver Queue messages to NestJS through `@InboundController()` and `@InboundReceiver(...)`; Queue-specific acknowledgement, retry, batching, and dead-letter behavior stays in the Worker Queue router.
- Keep each inbound receiver in the feature module that owns its business operation. Do not create one application-wide controller that injects services from unrelated features.
- Keep Queue constants only for values shared by multiple production consumers that cannot be derived from the Queue manifest. Container outbound virtual hosts belong to the container outbound manifest, not to Queue constants. Do not create constants merely to name a one-off implementation detail.
- Tests may assert literal expected paths and Queue names when their purpose is to detect accidental contract changes. Avoid deriving both implementation and expectation from the same declaration when that would make the test tautological.
