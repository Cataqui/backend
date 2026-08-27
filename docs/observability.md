# Observability Runbook

This runbook describes the Cataquí backend signal model, local performance diagnostics, Datadog attachment, and incident validation. Datadog is intentionally detached until its runtime key and control-plane inputs are supplied.

## Signal model

```text
Public client -> API Worker -> API container -> PostgreSQL, Redis, and providers
Meta callback -> Webhooks Worker -> API Worker inbound RPC -> API container
Address request -> Geosearch Worker -> Google Places
API container -> API Worker outbound RPC -> Queue
Queue -> API Worker batch delivery -> API container

API, Webhooks, and Geosearch Workers -> privacy-bounded structured lifecycle logs
API container -> OpenTelemetry traces, metrics, and structured logs
OpenTofu -> Datadog dashboards, monitors, SLO, Synthetics, and access policies
```

The edge and container are separate observability boundaries. Workers create the request identifier and emit safe, bounded lifecycle records. The container reuses that identifier and owns application request spans, dependency spans, product counters, operation metrics, runtime metrics, typed error metrics, and structured application logs.

Worker logs identify their deployed script as the service and include the immutable Worker version. Geosearch emits a bounded lifecycle for every request and a separate Google Places operation lifecycle with duration, operation, outcome, and the same request identifier. Container telemetry uses the stable `cataqui-api` service name plus `deployment.environment.name`, `service.version`, and `service.instance.id`. Do not join related telemetry by timestamps when the request identifier is available.

## Local development

`pnpm start:dev` does not require Datadog. Development starts the OpenTelemetry instrumentations with a console span exporter and prints one `api.dependency.completed` record for each completed supported dependency span. Each record includes:

- dependency system and operation;
- duration in milliseconds;
- outcome and span status;
- trace and span identifiers;
- the full development-only attributes and events needed to inspect local behavior.

The normal structured request log includes the request duration and request identifier. Use the trace identifier to group a request with its Redis, Prisma/PostgreSQL, HTTP, and other automatically instrumented child work. A dependency without supported OpenTelemetry instrumentation will not appear until an explicit bounded span is added at its owning integration boundary.

Development logging is intentionally unredacted. Staging and production continue to remove request bodies, query strings, authorization material, cookies, provider payloads, database statements and bind values, raw exception messages, and user or entity identifiers.

The development defaults are:

```ini
SERVICE_VERSION=local
SERVICE_INSTANCE_ID=local-development
OBSERVABILITY_TRACE_SAMPLE_RATIO=1
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost
OTEL_EXPORTER_OTLP_HEADERS=disabled
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta
```

The explicit `.env` values may use the production Datadog endpoint while keeping `OTEL_EXPORTER_OTLP_HEADERS=disabled`; the disabled sentinel still prevents network export.

## Runtime attachment

The deployed Workers already provide the non-secret service identity, instance identity, release identity, sampling ratio, OTLP protocol, delta temporality, and the configured US1 Cloudflare managed-platform endpoint. Attachment requires only a dedicated Datadog runtime API key supplied to each API Worker environment as the secret:

```ini
OTEL_EXPORTER_OTLP_HEADERS=dd-api-key=<runtime-api-key>
```

Use a dedicated runtime API key, not the OpenTofu provider key. Datadog API keys are long-lived, so keep the value in the deployment secret store, never in source, Wrangler variables, OpenTofu variables, saved plans, state, logs, or command arguments. The application rejects malformed headers and any non-US1 or non-Cloudflare managed-platform endpoint outside development and tests.

The Cloudflare managed-platform endpoint appends `/v1/traces`, `/v1/metrics`, and `/v1/logs` for the respective exporters. Metrics use delta temporality because direct managed-platform intake does not provide a stateful cumulative-to-delta conversion layer.

The API, Webhooks, and Geosearch Workers persist their structured logs in Cloudflare Observability. A Datadog Worker-log destination is a separate attachment step: create and verify that destination at the selected Datadog site, then add its exact destination name to every Worker's log destinations. Do not enable automatic invocation logs or native Worker traces until their raw request attributes can be proven safe for export.

## OpenTofu control plane

The Datadog root is an independent R2-backed OpenTofu state for staging and production. The repository pins OpenTofu and the Datadog provider, runs provider-mocked plans for the complete resource contract, and keeps runtime telemetry disabled by default. Applying while disabled retains dashboards and access policies while every monitor remains draft and every retained Synthetic remains paused.

Provider authentication is supplied only through `DD_API_KEY` and `DD_APP_KEY`. The Datadog API origin comes from the validated stable platform coordinates. OpenTofu also requires these non-secret or policy inputs:

```ini
TF_VAR_environment=staging
TF_VAR_datadog_organization_id=<organization-uuid>
TF_VAR_observability_editor_role_ids=["<role-uuid>"]
TF_VAR_nonpaging_notification_handles=["@slack-backend-alerts"]
TF_VAR_pager_notification_handles=[]
TF_VAR_runtime_telemetry_enabled=false
```

Production requires at least one paging destination. Staging rejects paging destinations. Paging and non-paging destinations must be disjoint. Every monitor and the SLO retain organization viewer access while editor access is limited to the declared roles.

Initialize an environment with the shared R2 backend configuration and its exact environment/root key, review an unsaved plan, and apply only that reviewed plan. Never use OpenTofu workspaces for environment isolation and never upload a saved plan as an artifact.

The normal repository checks are:

```sh
pnpm check:opentofu
pnpm check
```

The privileged bootstrap checks that the local Datadog `pup` session is authenticated to the configured site. It deliberately does not create, rotate, print, or persist Datadog keys. Do not run the full bootstrap merely as a test because it reconciles live prerequisites for both persistent environments.

## Managed analytics

The control plane manages three operator dashboards, twenty-eight monitors, a request-based availability SLO, an optional API Synthetic, and restriction policies.

The service-health view covers request volume, availability, p95 latency, active requests, releases, SLO budget, and monitor state. The ingress and authentication view compares API, Webhooks, and Geosearch edge volume and latency; it also covers Geosearch request outcomes and Google Places duration, inbound and outbound RPC, Queue delivery, NOTP exchange latency and capacity, verification outcomes, and recovery failures. The product and runtime view covers bounded successful product events, operation outcomes, typed failures, Node.js event-loop behavior, V8 heap pressure, garbage collection, and recent fatal lifecycle events.

The standard public latency and active-request queries exclude the intentional `/v1/auth/notp/intents/exchange` long poll. Dedicated NOTP views use the runtime lease and per-container capacity boundaries. The availability SLO counts good outcomes over non-aborted public requests completed by the API container and excludes health checks, unmatched requests, internal delivery, and client aborts. Independent Worker monitors cover failures that occur before Nest receives a request.

Product counters represent successful API responses only. They contain bounded event names and must not include user, job, phone, address, token, request, or other entity identifiers. They do not imply that off-platform work was agreed or completed.

## Staging validation before attachment

Before enabling production telemetry:

1. Run the full repository checks and review the staging OpenTofu plan.
2. Attach a dedicated staging runtime key and deploy one immutable version.
3. Generate public API, Webhooks, Geosearch search and details, inbound RPC, outbound RPC, Queue, NOTP, PostgreSQL, Redis, and provider traffic.
4. Prove that Worker and container records share the edge-generated request identifier.
5. Prove that a request trace has its normalized route, method, status, and expected child spans without concrete URLs, payloads, credentials, SQL, bind values, or raw exception text.
6. Prove log-to-trace correlation through top-level lowercase hexadecimal `trace_id` and `span_id` fields.
7. Confirm delta metrics contain only the reviewed bounded dimensions and all service, environment, version, and instance resource attributes.
8. Trigger controlled returned-5xx, thrown, startup, container-stop, rate-limit, inbound, outbound, Webhooks delivery, Geosearch provider timeout and rejection, NOTP recovery, and Queue retry failures; verify the exact monitors without log samples embedded in notifications.
9. Confirm ordinary latency excludes NOTP long polling while the dedicated NOTP latency, outcomes, and per-instance capacity populate.
10. Confirm an unapproved role cannot edit or mute protected resources.
11. If Synthetics is enabled, verify it retains no response body, creates no product data, uses the configured retries, and routes notifications correctly.
12. Record the organization, environment, immutable release, reviewed plan, signal-query evidence, and operator.

Starting an exporter or completing an apply is not validation. The signals must be queryable in the intended Datadog organization with the expected fields and access controls.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Local request timing but no dependency breakdown | Dependency has no supported instrumentation or was loaded before registration | Verify the registration import is the first runtime import and add a bounded span only at the owning integration if needed |
| OTLP `401` or `403` | Invalid runtime API key or wrong organization/site | Validate the dedicated key and US1 destination, then rotate if exposure is possible |
| OTLP `404` | Wrong managed-platform endpoint or signal path | Use the configured Cloudflare endpoint and the standard `/v1/*` signal paths |
| OTLP `413` | Export batch exceeds the direct-intake limit | Reduce the batch size or flush interval |
| Logs lack trace links | No active context or incorrect field format | Verify top-level `trace_id`, `span_id`, and aligned service/environment/version identity |
| Metrics are absent or rejected | Cumulative temporality was sent | Restore delta temporality and generate fresh traffic |
| Worker logs are absent from Datadog | External log destination is unattached or unhealthy | Verify the exact destination for all three scripts and query Cloudflare Observability first |
| Runtime metrics exist but no Datadog host appears | Expected direct-OTLP limitation | Use process/runtime dashboards rather than host inventory |
| Queue alert has no Datadog depth metric | Cloudflare integration does not publish the required Queue depth/age signal | Correlate bounded retry logs and inspect Queue backlog and dead-letter state in Cloudflare |
| OpenTofu can authenticate but one resource fails | Scoped application key lacks a required permission | Add only the documented permission and re-plan |
| OpenTofu reads the wrong state | Incorrect environment backend selection | Stop before apply, reinitialize with the exact backend key, and review the plan |

## Safe rollback

If export causes instability, sensitive-data exposure, or uncontrolled spend:

1. Set the runtime secret back to `disabled` and redeploy.
2. Keep OpenTofu ownership and set `runtime_telemetry_enabled=false` so monitors are draft and Synthetics paused.
3. Rotate the runtime API key if it may have been exposed.
4. Remove the unsafe attribute at its owning boundary before re-enabling export.
5. Preserve dashboards, SLO history, and incident evidence.
6. Repeat the staging validation before production is re-enabled.

## Official references

- [Datadog OTLP intake for managed platforms](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/managed_platforms/)
- [Datadog API and application keys](https://docs.datadoghq.com/account_management/api-app-keys/)
- [Datadog service accounts](https://docs.datadoghq.com/account_management/org_settings/service_accounts/)
- [Datadog OpenTelemetry compatibility](https://docs.datadoghq.com/opentelemetry/compatibility/)
- [Datadog OpenTelemetry log and trace correlation](https://docs.datadoghq.com/opentelemetry/correlate/logs_and_traces/)
- [Datadog monitor notification variables](https://docs.datadoghq.com/monitors/notify/variables/)
- [Datadog OpenTofu and Terraform integration](https://docs.datadoghq.com/integrations/terraform/)
- [Cloudflare OpenTelemetry export](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
- [Cloudflare Workers observability](https://developers.cloudflare.com/workers/observability/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
