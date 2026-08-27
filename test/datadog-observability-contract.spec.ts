import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthSessionObservabilityConstants } from "../apps/api/src/modules/auth/auth-session-observability.constants";
import { NotpExchangeWaitOutcome } from "../apps/api/src/modules/auth/notp/enums/notp-exchange-wait-outcome.enum";
import { NotpVerificationOutcome } from "../apps/api/src/modules/auth/notp/enums/notp-verification-outcome.enum";
import { NotpConstants } from "../apps/api/src/modules/auth/notp/notp.constants";
import { NotpObservabilityConstants } from "../apps/api/src/modules/auth/notp/notp-observability.constants";
import { ObservabilityEventConstants } from "../packages/observability-contracts/src/observability-event.constants";

const repositoryRoot = process.cwd();
const observabilityRoot = resolve(repositoryRoot, "infrastructure/opentofu/roots/datadog-observability");
const dashboardsSource = readFileSync(resolve(observabilityRoot, "dashboards.tf"), "utf8");
const monitorsSource = ["monitors.tf", "edge-and-queue-monitors.tf"]
	.map((fileName) => readFileSync(resolve(observabilityRoot, fileName), "utf8"))
	.join("\n");
const variablesSource = readFileSync(resolve(observabilityRoot, "variables.tf"), "utf8");
const rateLimitStorageSource = readFileSync(
	resolve(repositoryRoot, "apps/api/src/core/throttle/redis-throttler.storage.ts"),
	"utf8",
);
const apiWorkerSource = readFileSync(
	resolve(repositoryRoot, "apps/api/src/platform/cloudflare/workers/api/worker.ts"),
	"utf8",
);
const apiContainerSource = readFileSync(
	resolve(repositoryRoot, "apps/api/src/platform/cloudflare/containers/api/api-container.ts"),
	"utf8",
);
const geosearchAppSource = readFileSync(resolve(repositoryRoot, "apps/workers/geosearch/src/app.ts"), "utf8");
const geosearchRepositorySource = readFileSync(
	resolve(repositoryRoot, "apps/workers/geosearch/src/addresses/addresses.repository.ts"),
	"utf8",
);
const webhooksAppSource = readFileSync(resolve(repositoryRoot, "apps/workers/webhooks/src/app.ts"), "utf8");
const webhooksRepositorySource = readFileSync(
	resolve(repositoryRoot, "apps/workers/webhooks/src/notp/notp.repository.ts"),
	"utf8",
);
const telemetrySource = readFileSync(resolve(repositoryRoot, "apps/api/src/core/observability/telemetry.ts"), "utf8");

function _getOpenTofuNumericDefault(params: { source: string; variableName: string }): number {
	const defaultMatch = params.source.match(
		new RegExp(`variable "${params.variableName}" \\{[\\s\\S]*?default\\s+=\\s+([0-9_]+(?:\\.[0-9]+)?)`),
	);
	const numericDefault = defaultMatch?.[1];

	if (numericDefault === undefined) {
		throw new Error(`OpenTofu variable ${params.variableName} must declare a numeric default.`);
	}

	return Number(numericDefault.replaceAll("_", ""));
}

describe("Datadog observability cross-layer contracts", () => {
	it("should cover every bounded authentication event and semantic outcome used by the runtime", () => {
		expect({
			authSessionEventsCovered: Object.values(AuthSessionObservabilityConstants).every(
				(eventName) => dashboardsSource.includes(eventName) && monitorsSource.includes(eventName),
			),
			notpEventsCovered: Object.values(NotpObservabilityConstants).every((eventName) =>
				dashboardsSource.includes(eventName),
			),
			semanticOutcomesCovered: [
				...Object.values(NotpExchangeWaitOutcome),
				...Object.values(NotpVerificationOutcome),
			].every((outcome) => dashboardsSource.includes(outcome)),
		}).toEqual({ authSessionEventsCovered: true, notpEventsCovered: true, semanticOutcomesCovered: true });
	});

	it("should derive authentication long-poll alert boundaries from the runtime capacity contract", () => {
		expect({
			latencyWarningSeconds: _getOpenTofuNumericDefault({
				source: variablesSource,
				variableName: "auth_exchange_latency_p95_warning_seconds",
			}),
			latencyCriticalSeconds: _getOpenTofuNumericDefault({
				source: variablesSource,
				variableName: "auth_exchange_latency_p95_critical_seconds",
			}),
			capacityCritical: _getOpenTofuNumericDefault({
				source: variablesSource,
				variableName: "auth_exchange_active_requests_per_instance_critical",
			}),
		}).toEqual({
			latencyWarningSeconds: NotpConstants.EXCHANGE_LONG_POLL_MAX_LEASE_HOLD_MILLISECONDS / 1_000,
			latencyCriticalSeconds: NotpConstants.EXCHANGE_LONG_POLL_LEASE_EXPIRATION_MILLISECONDS / 1_000,
			capacityCritical: NotpConstants.MAX_CONCURRENT_EXCHANGE_LONG_POLLS_PER_CONTAINER - 1,
		});
	});

	it("should alert on the exact fail-closed rate-limit enforcement event emitted by the runtime", () => {
		expect({
			emitted: rateLimitStorageSource.includes("API_RATE_LIMIT_ENFORCEMENT_FAILED_EVENT"),
			monitored: monitorsSource.includes(ObservabilityEventConstants.API_RATE_LIMIT_ENFORCEMENT_FAILED_EVENT),
		}).toEqual({ emitted: true, monitored: true });
	});

	it("should monitor every emitted public-edge and runtime lifecycle failure that can bypass the Nest SLI", () => {
		const emittedFailureContracts = [
			{
				constantName: "API_WORKER_REQUEST_REJECTED_EVENT",
				eventName: ObservabilityEventConstants.API_WORKER_REQUEST_REJECTED_EVENT,
				source: apiWorkerSource,
			},
			{
				constantName: "API_WORKER_REQUEST_FAILED_EVENT",
				eventName: ObservabilityEventConstants.API_WORKER_REQUEST_FAILED_EVENT,
				source: apiWorkerSource,
			},
			{
				constantName: "API_CONTAINER_RUNTIME_FAILED_EVENT",
				eventName: ObservabilityEventConstants.API_CONTAINER_RUNTIME_FAILED_EVENT,
				source: apiContainerSource,
			},
			{
				constantName: "API_CONTAINER_STOPPED_UNEXPECTED_EVENT",
				eventName: ObservabilityEventConstants.API_CONTAINER_STOPPED_UNEXPECTED_EVENT,
				source: apiContainerSource,
			},
			{
				constantName: "API_APPLICATION_START_FAILED_EVENT",
				eventName: ObservabilityEventConstants.API_APPLICATION_START_FAILED_EVENT,
				source: telemetrySource,
			},
			{
				constantName: "API_TELEMETRY_SHUTDOWN_FAILED_EVENT",
				eventName: ObservabilityEventConstants.API_TELEMETRY_SHUTDOWN_FAILED_EVENT,
				source: telemetrySource,
			},
			{
				constantName: "GEOSEARCH_REQUEST_FAILED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_REQUEST_FAILED_EVENT,
				source: geosearchAppSource,
			},
			{
				constantName: "GEOSEARCH_PROVIDER_REQUEST_REJECTED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_REJECTED_EVENT,
				source: geosearchRepositorySource,
			},
			{
				constantName: "GEOSEARCH_PROVIDER_REQUEST_FAILED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_FAILED_EVENT,
				source: geosearchRepositorySource,
			},
		];

		expect(
			emittedFailureContracts.map(({ constantName, eventName, source }) => ({
				emitted: source.includes(constantName),
				eventName: eventName,
				monitored: monitorsSource.includes(eventName),
			})),
		).toEqual(
			emittedFailureContracts.map(({ eventName }) => ({
				emitted: true,
				eventName: eventName,
				monitored: true,
			})),
		);
	});

	it("should chart every emitted Geosearch request and provider lifecycle", () => {
		const lifecycleEvents = [
			{
				constantName: "GEOSEARCH_REQUEST_COMPLETED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_REQUEST_COMPLETED_EVENT,
				source: geosearchAppSource,
			},
			{
				constantName: "GEOSEARCH_REQUEST_REJECTED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_REQUEST_REJECTED_EVENT,
				source: geosearchAppSource,
			},
			{
				constantName: "GEOSEARCH_REQUEST_FAILED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_REQUEST_FAILED_EVENT,
				source: geosearchAppSource,
			},
			{
				constantName: "GEOSEARCH_PROVIDER_REQUEST_COMPLETED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_COMPLETED_EVENT,
				source: geosearchRepositorySource,
			},
			{
				constantName: "GEOSEARCH_PROVIDER_REQUEST_REJECTED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_REJECTED_EVENT,
				source: geosearchRepositorySource,
			},
			{
				constantName: "GEOSEARCH_PROVIDER_REQUEST_FAILED_EVENT",
				eventName: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_FAILED_EVENT,
				source: geosearchRepositorySource,
			},
		];

		expect(
			lifecycleEvents.map(({ constantName, eventName, source }) => ({
				charted: dashboardsSource.includes(eventName),
				emitted: source.includes(constantName),
				eventName: eventName,
			})),
		).toEqual(lifecycleEvents.map(({ eventName }) => ({ charted: true, emitted: true, eventName: eventName })));
	});

	it("should chart every emitted direct inbound and Queue lifecycle", () => {
		const lifecycleEvents = [
			["API_WORKER_INBOUND_CALL_COMPLETED_EVENT", ObservabilityEventConstants.API_WORKER_INBOUND_CALL_COMPLETED_EVENT],
			["API_WORKER_INBOUND_CALL_REJECTED_EVENT", ObservabilityEventConstants.API_WORKER_INBOUND_CALL_REJECTED_EVENT],
			["API_WORKER_INBOUND_CALL_FAILED_EVENT", ObservabilityEventConstants.API_WORKER_INBOUND_CALL_FAILED_EVENT],
			[
				"API_WORKER_QUEUE_DELIVERY_COMPLETED_EVENT",
				ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_COMPLETED_EVENT,
			],
			[
				"API_WORKER_QUEUE_DELIVERY_REJECTED_EVENT",
				ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_REJECTED_EVENT,
			],
			["API_WORKER_QUEUE_DELIVERY_FAILED_EVENT", ObservabilityEventConstants.API_WORKER_QUEUE_DELIVERY_FAILED_EVENT],
			["API_WORKER_QUEUE_BATCH_COMPLETED_EVENT", ObservabilityEventConstants.API_WORKER_QUEUE_BATCH_COMPLETED_EVENT],
			["API_WORKER_QUEUE_BATCH_FAILED_EVENT", ObservabilityEventConstants.API_WORKER_QUEUE_BATCH_FAILED_EVENT],
		] as const;

		expect(
			lifecycleEvents.map(([constantName, eventName]) => ({
				charted: dashboardsSource.includes(eventName),
				emitted: apiWorkerSource.includes(constantName),
				eventName: eventName,
			})),
		).toEqual(lifecycleEvents.map(([, eventName]) => ({ charted: true, emitted: true, eventName: eventName })));
	});

	it("should chart every emitted Webhooks request and API-delivery lifecycle", () => {
		const lifecycleEvents = [
			[
				"WEBHOOKS_REQUEST_COMPLETED_EVENT",
				ObservabilityEventConstants.WEBHOOKS_REQUEST_COMPLETED_EVENT,
				webhooksAppSource,
			],
			[
				"WEBHOOKS_REQUEST_REJECTED_EVENT",
				ObservabilityEventConstants.WEBHOOKS_REQUEST_REJECTED_EVENT,
				webhooksAppSource,
			],
			["WEBHOOKS_REQUEST_FAILED_EVENT", ObservabilityEventConstants.WEBHOOKS_REQUEST_FAILED_EVENT, webhooksAppSource],
			[
				"WEBHOOKS_API_INBOUND_DELIVERY_COMPLETED_EVENT",
				ObservabilityEventConstants.WEBHOOKS_API_INBOUND_DELIVERY_COMPLETED_EVENT,
				webhooksRepositorySource,
			],
			[
				"WEBHOOKS_API_INBOUND_DELIVERY_REJECTED_EVENT",
				ObservabilityEventConstants.WEBHOOKS_API_INBOUND_DELIVERY_REJECTED_EVENT,
				webhooksRepositorySource,
			],
		] as const;

		expect(
			lifecycleEvents.map(([constantName, eventName, source]) => ({
				charted: dashboardsSource.includes(eventName),
				emitted: source.includes(constantName),
				eventName: eventName,
			})),
		).toEqual(lifecycleEvents.map(([, eventName]) => ({ charted: true, emitted: true, eventName: eventName })));
	});
});
