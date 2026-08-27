import { SpanStatusCode } from "@opentelemetry/api";
import { HttpRequestTerminationReason } from "./http-request-termination-reason.enum";
import { createNodeInstrumentations } from "./node-instrumentations";

const instrumentationHarness = vi.hoisted(() => ({
	findHttpRequestTerminationReason: vi.fn(),
	getHttpRouteTelemetry: vi.fn(),
	getNodeAutoInstrumentations: vi.fn((_configuration: Record<string, unknown>) => []),
	prismaInstrumentation: vi.fn(),
	rememberHttpRequestTermination: vi.fn(),
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
	getNodeAutoInstrumentations: instrumentationHarness.getNodeAutoInstrumentations,
}));

vi.mock("@prisma/instrumentation", () => ({
	PrismaInstrumentation: instrumentationHarness.prismaInstrumentation,
}));

vi.mock("./http-request-termination.store", () => ({
	findHttpRequestTerminationReason: instrumentationHarness.findHttpRequestTerminationReason,
	rememberHttpRequestTermination: instrumentationHarness.rememberHttpRequestTermination,
}));

vi.mock("./http-route-telemetry.store", () => ({
	getHttpRouteTelemetry: instrumentationHarness.getHttpRouteTelemetry,
}));

function _createSpanHarness() {
	return {
		setAttribute: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		updateName: vi.fn(),
	};
}

function _getHttpInstrumentationConfig(params: { redactSensitiveHttpAttributes?: boolean } = {}) {
	createNodeInstrumentations({ redactSensitiveHttpAttributes: params.redactSensitiveHttpAttributes ?? true });
	const autoInstrumentationConfig = instrumentationHarness.getNodeAutoInstrumentations.mock.calls.at(-1)?.[0];

	return autoInstrumentationConfig?.["@opentelemetry/instrumentation-http"] as {
		applyCustomAttributesOnSpan: (span: ReturnType<typeof _createSpanHarness>, request: object) => void;
		redactedQueryParams: string[];
		requestHook: (span: ReturnType<typeof _createSpanHarness>, request: object) => void;
	};
}

describe("Node OpenTelemetry instrumentation hooks", () => {
	beforeEach(() => {
		instrumentationHarness.findHttpRequestTerminationReason.mockReset();
		instrumentationHarness.getHttpRouteTelemetry.mockReset();
		instrumentationHarness.getNodeAutoInstrumentations.mockClear();
		instrumentationHarness.prismaInstrumentation.mockClear();
		instrumentationHarness.rememberHttpRequestTermination.mockReset();
	});

	it("should register only the bounded automatic instrumentations and Prisma", () => {
		const instrumentationConfig = _getHttpInstrumentationConfig();
		const autoInstrumentationConfig = instrumentationHarness.getNodeAutoInstrumentations.mock.calls[0]?.[0] ?? {};

		expect({
			fileSystemInstrumentation: autoInstrumentationConfig["@opentelemetry/instrumentation-fs"],
			pinoInstrumentation: autoInstrumentationConfig["@opentelemetry/instrumentation-pino"],
			prismaInstrumentationInstances: instrumentationHarness.prismaInstrumentation.mock.instances.length,
			redactedQueryParams: instrumentationConfig.redactedQueryParams,
		}).toEqual({
			fileSystemInstrumentation: { enabled: false },
			pinoInstrumentation: { enabled: false },
			prismaInstrumentationInstances: 1,
			redactedQueryParams: [
				"access_token",
				"api_key",
				"apikey",
				"authorization",
				"code",
				"cursor",
				"password",
				"refreshToken",
				"refresh_token",
				"sig",
				"signature",
				"token",
			],
		});
	});

	it("should apply a normalized route and error status to timed-out requests", () => {
		const rawRequest = {};
		instrumentationHarness.getHttpRouteTelemetry.mockReturnValue({ method: "GET", route: "/v1/feed" });
		instrumentationHarness.findHttpRequestTerminationReason.mockReturnValue(HttpRequestTerminationReason.TIMEOUT);
		const span = _createSpanHarness();

		_getHttpInstrumentationConfig().applyCustomAttributesOnSpan(span, rawRequest);

		expect({
			attributes: span.setAttribute.mock.calls,
			name: span.updateName.mock.calls,
			status: span.setStatus.mock.calls,
		}).toEqual({
			attributes: [
				["http.route", "/v1/feed"],
				["cataqui.http.outcome", HttpRequestTerminationReason.TIMEOUT],
			],
			name: [["GET /v1/feed"]],
			status: [[{ code: SpanStatusCode.ERROR }]],
		});
	});

	it("should leave spans unchanged when neither route nor termination metadata exists", () => {
		const span = _createSpanHarness();

		_getHttpInstrumentationConfig().applyCustomAttributesOnSpan(span, {});

		expect({
			attributes: span.setAttribute.mock.calls,
			name: span.updateName.mock.calls,
			status: span.setStatus.mock.calls,
		}).toEqual({ attributes: [], name: [], status: [] });
	});

	it("should record aborted requests without marking their spans as errors", () => {
		instrumentationHarness.findHttpRequestTerminationReason.mockReturnValue(HttpRequestTerminationReason.ABORTED);
		const span = _createSpanHarness();

		_getHttpInstrumentationConfig().applyCustomAttributesOnSpan(span, {});

		expect({ attributes: span.setAttribute.mock.calls, status: span.setStatus.mock.calls }).toEqual({
			attributes: [["cataqui.http.outcome", HttpRequestTerminationReason.ABORTED]],
			status: [[{ code: SpanStatusCode.UNSET }]],
		});
	});

	it("should subscribe only abort-capable server requests and remember their terminal outcome", () => {
		const span = _createSpanHarness();
		let abortRequest: (() => void) | undefined;
		const serverRequest = {
			complete: false,
			once: vi.fn((_event: string, listener: () => void) => {
				abortRequest = listener;
				return serverRequest;
			}),
		};
		const requestHook = _getHttpInstrumentationConfig().requestHook;

		requestHook(span, {});
		requestHook(span, serverRequest);
		abortRequest?.();

		expect({
			abortSubscriptions: serverRequest.once.mock.calls,
			redactionCalls: span.setAttributes.mock.calls.length,
			rememberedTermination: instrumentationHarness.rememberHttpRequestTermination.mock.calls,
		}).toEqual({
			abortSubscriptions: [["aborted", expect.any(Function)]],
			redactionCalls: 2,
			rememberedTermination: [
				[
					{
						request: serverRequest,
						terminationReason: HttpRequestTerminationReason.ABORTED,
					},
				],
			],
		});
	});

	it("should preserve complete HTTP dependency details in development", () => {
		const span = _createSpanHarness();
		const instrumentationConfig = _getHttpInstrumentationConfig({ redactSensitiveHttpAttributes: false });

		instrumentationConfig.requestHook(span, {});

		expect({
			redactedQueryParams: instrumentationConfig.redactedQueryParams,
			redactionCalls: span.setAttributes.mock.calls,
		}).toEqual({
			redactedQueryParams: [],
			redactionCalls: [],
		});
	});
});
