import type { Meter, Tracer } from "@opentelemetry/api";
import { ApiErrorOrigin } from "./api-error-origin.enum";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { ObservabilityOperationName } from "./observability-operation-name.enum";
import { ObservabilityService } from "./observability.service";
import { ProductAnalyticsEventName } from "./product-analytics-event-name.enum";

function _createServiceHarness() {
	const httpRequestCountAdd = vi.fn();
	const httpRequestDurationRecord = vi.fn();
	const activeHttpRequestsObserve = vi.fn();
	let activeHttpRequestsCallback:
		| ((result: { observe: (value: number, attributes: Record<string, string>) => void }) => void)
		| undefined;
	const apiErrorCountAdd = vi.fn();
	const productEventCountAdd = vi.fn();
	const operationCountAdd = vi.fn();
	const operationDurationRecord = vi.fn();
	const counters = [
		{ add: httpRequestCountAdd },
		{ add: apiErrorCountAdd },
		{ add: productEventCountAdd },
		{ add: operationCountAdd },
	];
	const histograms = [{ record: httpRequestDurationRecord }, { record: operationDurationRecord }];
	const meter = {
		createCounter: vi.fn(() => counters.shift()),
		createHistogram: vi.fn(() => histograms.shift()),
		createObservableGauge: vi.fn(() => ({
			addCallback: vi.fn((callback) => {
				activeHttpRequestsCallback = callback;
			}),
		})),
	} as unknown as Meter;
	const startActiveSpan = vi.fn((_name, _options, callback) =>
		callback({
			addEvent: vi.fn(),
			end: vi.fn(),
			setAttribute: vi.fn(),
			setStatus: vi.fn(),
		}),
	);
	const tracer = { startActiveSpan: startActiveSpan } as unknown as Tracer;

	return {
		service: new ObservabilityService({ meter: meter, tracer: tracer }),
		httpRequestCountAdd: httpRequestCountAdd,
		httpRequestDurationRecord: httpRequestDurationRecord,
		observeActiveHttpRequests: () => activeHttpRequestsCallback?.({ observe: activeHttpRequestsObserve }),
		activeHttpRequestsObserve: activeHttpRequestsObserve,
		apiErrorCountAdd: apiErrorCountAdd,
		productEventCountAdd: productEventCountAdd,
		operationCountAdd: operationCountAdd,
		operationDurationRecord: operationDurationRecord,
		startActiveSpan: startActiveSpan,
	};
}

describe("ObservabilityService", () => {
	it("should record completed HTTP requests with bounded metric dimensions", () => {
		const harness = _createServiceHarness();

		harness.service.recordHttpRequestCompleted({
			durationSeconds: 0.25,
			method: "GET",
			route: "/v1/jobs/:jobId",
			statusCode: 200,
		});

		expect(harness.httpRequestCountAdd).toHaveBeenCalledWith(1, {
			availability_outcome: "GOOD",
			http_route: "/v1/jobs/:jobId",
			outcome: "SUCCESS",
			request_method: "GET",
			status_class: "2XX",
			status_code: "200",
			traffic_surface: "PUBLIC_API",
		});
	});

	it("should record HTTP duration in seconds with the same dimensions as request counts", () => {
		const harness = _createServiceHarness();

		harness.service.recordHttpRequestCompleted({
			durationSeconds: 0.25,
			method: "GET",
			route: "/v1/feed",
			statusCode: 503,
		});

		expect(harness.httpRequestDurationRecord).toHaveBeenCalledWith(0.25, {
			availability_outcome: "BAD",
			http_route: "/v1/feed",
			outcome: "ERROR",
			request_method: "GET",
			status_class: "5XX",
			status_code: "503",
			traffic_surface: "PUBLIC_API",
		});
	});

	it("should collapse extension methods before recording custom HTTP metrics", () => {
		const harness = _createServiceHarness();

		harness.service.recordHttpRequestCompleted({
			durationSeconds: 0.25,
			method: "PROPFIND",
			route: "/v1/feed",
			statusCode: 200,
		});

		expect(harness.httpRequestCountAdd).toHaveBeenCalledWith(1, expect.objectContaining({ request_method: "_OTHER" }));
	});

	it.each([
		{
			expectedAvailabilityOutcome: "EXCLUDED",
			terminationReason: HttpRequestTerminationReason.ABORTED,
		},
		{
			expectedAvailabilityOutcome: "BAD",
			terminationReason: HttpRequestTerminationReason.TIMEOUT,
		},
	] as const)(
		"should record $terminationReason requests without inventing an HTTP response status",
		({ expectedAvailabilityOutcome, terminationReason }) => {
			const harness = _createServiceHarness();

			harness.service.recordHttpRequestTerminated({
				durationSeconds: 1.5,
				method: "POST",
				route: "/v1/jobs/drafts",
				terminationReason: terminationReason,
			});

			expect(harness.httpRequestCountAdd).toHaveBeenCalledWith(1, {
				availability_outcome: expectedAvailabilityOutcome,
				http_route: "/v1/jobs/drafts",
				outcome: terminationReason,
				request_method: "POST",
				status_class: "NO_RESPONSE",
				status_code: "NO_RESPONSE",
				traffic_surface: "PUBLIC_API",
			});
		},
	);

	it("should track active HTTP request increments and decrements", () => {
		const harness = _createServiceHarness();

		harness.service.addActiveHttpRequests({ delta: 1, route: "/v1/auth/notp/intents/exchange" });
		harness.service.addActiveHttpRequests({ delta: -1, route: "/v1/auth/notp/intents/exchange" });
		harness.observeActiveHttpRequests();

		expect(harness.activeHttpRequestsObserve).toHaveBeenCalledWith(0, {
			http_route: "/v1/auth/notp/intents/exchange",
			traffic_surface: "PUBLIC_API",
		});
	});

	it("should separate client errors from server errors", () => {
		const harness = _createServiceHarness();

		harness.service.recordApiError({
			errorCode: "VALIDATION_ERROR",
			method: "POST",
			origin: ApiErrorOrigin.CLIENT,
			route: "/v1/jobs/drafts",
			statusCode: 400,
		});

		expect(harness.apiErrorCountAdd).toHaveBeenCalledWith(1, {
			error_code: "VALIDATION_ERROR",
			error_origin: "CLIENT",
			http_route: "/v1/jobs/drafts",
			request_method: "POST",
			status_class: "4XX",
			status_code: "400",
			traffic_surface: "PUBLIC_API",
		});
	});

	it.each([
		{ expectedTrafficSurface: "HEALTH", route: "/v1/health" },
		{ expectedTrafficSurface: "HEALTH", route: "/v1/health/live" },
		{ expectedTrafficSurface: "INTERNAL_INBOUND", route: "/internal/inbound/derive-job-data" },
		{
			expectedTrafficSurface: "INTERNAL_INBOUND",
			route: "/internal/inbound/verify-whatsapp-notp",
		},
		{ expectedTrafficSurface: "UNMATCHED", route: "UNMATCHED" },
	] as const)("should classify $route outside the public availability surface", ({ expectedTrafficSurface, route }) => {
		const harness = _createServiceHarness();

		harness.service.recordHttpRequestCompleted({ durationSeconds: 0.1, method: "GET", route: route, statusCode: 200 });

		expect(harness.httpRequestCountAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ traffic_surface: expectedTrafficSurface }),
		);
	});

	it("should record only registered product analytics event names", () => {
		const harness = _createServiceHarness();

		harness.service.recordProductAnalyticsEvent({
			eventName: ProductAnalyticsEventName.JOB_CONTACT_REVEAL_REQUEST_SUCCEEDED,
		});

		expect(harness.productEventCountAdd).toHaveBeenCalledWith(1, {
			product_event: ProductAnalyticsEventName.JOB_CONTACT_REVEAL_REQUEST_SUCCEEDED,
		});
	});

	it("should record successful observed operations", async () => {
		const harness = _createServiceHarness();

		await harness.service.observeOperation({
			operationName: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
			operation: async () => "generated",
		});

		expect(harness.operationCountAdd).toHaveBeenCalledWith(1, {
			operation_name: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
			outcome: "SUCCESS",
		});
	});

	it("should preserve the result of a successful observed operation", async () => {
		const harness = _createServiceHarness();

		const result = await harness.service.observeOperation({
			operationName: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
			operation: async () => "generated",
		});

		expect(result).toBe("generated");
	});

	it("should record failed observed operations before preserving the failure", async () => {
		const harness = _createServiceHarness();
		const failure = new Error("gateway unavailable");

		await harness.service
			.observeOperation({
				operationName: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
				operation: async () => Promise.reject(failure),
			})
			.catch(() => undefined);

		expect(harness.operationCountAdd).toHaveBeenCalledWith(1, {
			operation_name: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
			outcome: "ERROR",
		});
	});

	it("should rethrow the original observed operation failure", async () => {
		const harness = _createServiceHarness();
		const failure = new Error("gateway unavailable");

		await expect(
			harness.service.observeOperation({
				operationName: ObservabilityOperationName.AI_DERIVE_JOB_DATA,
				operation: async () => Promise.reject(failure),
			}),
		).rejects.toBe(failure);
	});
});
