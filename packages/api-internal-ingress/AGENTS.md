# API Internal Ingress Instructions

These instructions apply to the trusted internal ingress package in this scope and supplement the repository root.

## Shared Internal Ingress

- Keep one authoritative inbound manifest for receiver names, schemas, and internal paths, and one Queue manifest for Queue base names and their typed inbound receivers.
- Keep this package limited to schemas, manifests, typed calls, routers, and direct-call or Queue transport primitives into the API container. Application services, NestJS controllers, provider logic, and deployment configuration do not belong here.
- Export every supported consumer surface through `package.json`; applications must never deep-import package source.
- Derive `QueueName` from the Queue manifest, and derive message validation and container delivery paths from the receiver registered in the inbound manifest. Never repeat a Queue endpoint separately in Worker and NestJS code.
- Deliver Queue messages to NestJS through `@InboundController()` and `@InboundReceiver(...)`; Queue-specific acknowledgement, retry, batching, and dead-letter behavior stays in the Worker Queue router.
- Keep each inbound receiver in the feature module that owns its business operation. Do not create one application-wide controller that injects services from unrelated features.
- Keep Queue constants only for values shared by multiple production consumers that cannot be derived from the Queue manifest. Container outbound virtual hosts belong to the container outbound manifest, not to Queue constants. Do not create constants merely to name a one-off implementation detail.
- Tests may assert literal expected paths and Queue names when their purpose is to detect accidental contract changes. Avoid deriving both implementation and expectation from the same declaration when that would make the test tautological.
