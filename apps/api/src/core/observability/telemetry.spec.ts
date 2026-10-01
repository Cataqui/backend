import type { IncomingMessage } from "node:http";
import { AggregationTemporality } from "@opentelemetry/sdk-metrics";

const sdkStart = vi.hoisted(() => vi.fn());
const sdkShutdown = vi.hoisted(() => vi.fn<() => Promise<void>>());
const nodeSdkConstructor = vi.hoisted(() => vi.fn());
const traceExporterConstructor = vi.hoisted(() => vi.fn());
const logExporterConstructor = vi.hoisted(() => vi.fn());
const metricExporterConstructor = vi.hoisted(() => vi.fn());
const httpInstrumentationConstructor = vi.hoisted(() => vi.fn());
const logEmit = vi.hoisted(() => vi.fn());

vi.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: class {
		constructor(config: unknown) {
			nodeSdkConstructor(config);
		}
		start = sdkStart;
		shutdown = sdkShutdown;
	},
}));
vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
	OTLPTraceExporter: class {
		constructor(config: unknown) {
			traceExporterConstructor(config);
		}
	},
}));
vi.mock("@opentelemetry/exporter-logs-otlp-proto", () => ({
	OTLPLogExporter: class {
		constructor(config: unknown) {
			logExporterConstructor(config);
		}
	},
}));
vi.mock("@opentelemetry/exporter-metrics-otlp-proto", () => ({
	OTLPMetricExporter: class {
		constructor(config: unknown) {
			metricExporterConstructor(config);
		}
	},
}));
vi.mock("@opentelemetry/instrumentation-http", () => ({
	HttpInstrumentation: class {
		constructor(config: unknown) {
			httpInstrumentationConstructor(config);
		}
	},
}));
vi.mock("@opentelemetry/api-logs", async (importOriginal) => ({
	...(await importOriginal<typeof import("@opentelemetry/api-logs")>()),
	logs: { getLogger: () => ({ emit: logEmit }) },
}));

const DATADOG_ENV = {
	NODE_ENV: "production",
	DATADOG_API_KEY: "test-datadog-key",
	DATADOG_OTLP_ENDPOINT: "https://otlp.example.com",
	SERVICE_VERSION: "abc123",
};

async function _loadTelemetry(env: Record<string, string | undefined>): Promise<typeof import("./telemetry")> {
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	return import("./telemetry");
}

function _captureProcessHandlers(): Map<string, (...args: unknown[]) => void> {
	const handlers = new Map<string, (...args: unknown[]) => void>();
	vi.spyOn(process, "once").mockImplementation((event, listener) => {
		handlers.set(String(event), listener as (...args: unknown[]) => void);
		return process;
	});
	return handlers;
}

describe("telemetry", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.spyOn(process, "once").mockReturnValue(process);
		vi.spyOn(process.stderr, "write").mockReturnValue(true);
		sdkShutdown.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe("startTelemetry", () => {
		it("should not start the SDK when the Datadog API key is missing", async () => {
			const { startTelemetry } = await _loadTelemetry({ ...DATADOG_ENV, DATADOG_API_KEY: undefined });

			startTelemetry();

			expect(sdkStart).not.toHaveBeenCalled();
		});

		it("should warn with the invalid field names when staging or production telemetry is misconfigured", async () => {
			const { startTelemetry } = await _loadTelemetry({ ...DATADOG_ENV, DATADOG_API_KEY: undefined });

			startTelemetry();

			expect(JSON.parse(String(vi.mocked(process.stderr.write).mock.calls[0]?.[0]))).toMatchObject({
				event: "api.telemetry.disabled",
				level: "warn",
				invalidFields: ["DATADOG_API_KEY"],
			});
		});

		it("should stay silent in development when Datadog is not configured", async () => {
			const { startTelemetry } = await _loadTelemetry({ NODE_ENV: "development", DATADOG_API_KEY: undefined });

			startTelemetry();

			expect(process.stderr.write).not.toHaveBeenCalled();
		});

		it("should reject a plain http endpoint so the API key is never sent unencrypted", async () => {
			const { startTelemetry } = await _loadTelemetry({
				...DATADOG_ENV,
				DATADOG_OTLP_ENDPOINT: "http://otlp.example.com",
			});

			startTelemetry();

			expect(sdkStart).not.toHaveBeenCalled();
		});

		it("should never export from tests even when a Datadog key is present", async () => {
			const { startTelemetry } = await _loadTelemetry({ ...DATADOG_ENV, NODE_ENV: "test" });

			startTelemetry();

			expect(sdkStart).not.toHaveBeenCalled();
		});

		it("should start the SDK when Datadog is configured", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();

			expect(sdkStart).toHaveBeenCalledOnce();
		});

		it("should start the SDK only once when called repeatedly", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			startTelemetry();

			expect(sdkStart).toHaveBeenCalledOnce();
		});

		it("should send traces to the OTLP traces path authenticated with the Datadog API key", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();

			expect(traceExporterConstructor).toHaveBeenCalledWith({
				url: "https://otlp.example.com/v1/traces",
				headers: { "dd-api-key": "test-datadog-key" },
			});
		});

		it("should send logs to the OTLP logs path authenticated with the Datadog API key", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();

			expect(logExporterConstructor).toHaveBeenCalledWith({
				url: "https://otlp.example.com/v1/logs",
				headers: { "dd-api-key": "test-datadog-key" },
			});
		});

		it("should send delta metrics because Datadog's direct OTLP intake cannot convert cumulative counters", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();

			expect(metricExporterConstructor).toHaveBeenCalledWith({
				url: "https://otlp.example.com/v1/metrics",
				headers: { "dd-api-key": "test-datadog-key" },
				temporalityPreference: AggregationTemporality.DELTA,
			});
		});

		it("should build signal URLs without a double slash when the endpoint ends with a slash", async () => {
			const { startTelemetry } = await _loadTelemetry({
				...DATADOG_ENV,
				DATADOG_OTLP_ENDPOINT: "https://otlp.example.com/",
			});

			startTelemetry();

			expect(traceExporterConstructor).toHaveBeenCalledWith(
				expect.objectContaining({ url: "https://otlp.example.com/v1/traces" }),
			);
		});

		it("should tag all telemetry with the service, version, and environment Datadog uses for unified tagging", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			const config = nodeSdkConstructor.mock.calls[0]?.[0] as { resource: { attributes: Record<string, unknown> } };

			expect(config.resource.attributes).toEqual({
				"service.name": "cataqui-api",
				"service.version": "abc123",
				"deployment.environment.name": "production",
			});
		});

		it("should report an unknown version when the Worker does not provide one", async () => {
			const { startTelemetry } = await _loadTelemetry({ ...DATADOG_ENV, SERVICE_VERSION: undefined });

			startTelemetry();
			const config = nodeSdkConstructor.mock.calls[0]?.[0] as { resource: { attributes: Record<string, unknown> } };

			expect(config.resource.attributes["service.version"]).toBe("unknown");
		});

		it("should skip tracing of the container liveness probe that runs every few seconds", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			const config = httpInstrumentationConstructor.mock.calls[0]?.[0] as {
				ignoreIncomingRequestHook: (request: IncomingMessage) => boolean;
			};

			expect(config.ignoreIncomingRequestHook({ url: "/v1/health/live" } as IncomingMessage)).toBe(true);
		});

		it("should trace every other incoming request", async () => {
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			const config = httpInstrumentationConstructor.mock.calls[0]?.[0] as {
				ignoreIncomingRequestHook: (request: IncomingMessage) => boolean;
			};

			expect(config.ignoreIncomingRequestHook({ url: "/v1/health" } as IncomingMessage)).toBe(false);
		});

		it("should flush telemetry before exiting cleanly on SIGTERM", async () => {
			const handlers = _captureProcessHandlers();
			const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			handlers.get("SIGTERM")?.();
			await vi.waitFor(() => expect(exit).toHaveBeenCalled());

			expect(sdkShutdown.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0] ?? 0);
		});

		it("should exit with code 0 after SIGTERM", async () => {
			const handlers = _captureProcessHandlers();
			const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			handlers.get("SIGTERM")?.();
			await vi.waitFor(() => expect(exit).toHaveBeenCalled());

			expect(exit).toHaveBeenCalledWith(0);
		});

		it("should still exit with code 1 after an uncaught exception, as Node does by default", async () => {
			const handlers = _captureProcessHandlers();
			const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			handlers.get("uncaughtException")?.(new Error("boom"));
			await vi.waitFor(() => expect(exit).toHaveBeenCalled());

			expect(exit).toHaveBeenCalledWith(1);
		});

		it("should write the crash to stderr so it stays visible in Cloudflare logs", async () => {
			const handlers = _captureProcessHandlers();
			vi.spyOn(process, "exit").mockReturnValue(undefined as never);
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			handlers.get("uncaughtException")?.(new TypeError("boom"));

			expect(JSON.parse(String(vi.mocked(process.stderr.write).mock.calls[0]?.[0]))).toMatchObject({
				event: "api.process.crashed",
				level: "fatal",
				errorName: "TypeError",
				errorMessage: "boom",
			});
		});

		it("should send the crash to Datadog before exiting", async () => {
			const handlers = _captureProcessHandlers();
			const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
			const { startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			handlers.get("uncaughtException")?.(new Error("boom"));
			await vi.waitFor(() => expect(exit).toHaveBeenCalled());

			expect(logEmit).toHaveBeenCalledWith(expect.objectContaining({ body: "api.process.crashed: boom" }));
		});
	});

	describe("recordFatalError", () => {
		it("should do nothing when telemetry never started", async () => {
			const { recordFatalError } = await _loadTelemetry({ ...DATADOG_ENV, DATADOG_API_KEY: undefined });

			await recordFatalError({ event: "api.application.start.failed", error: new Error("boom") });

			expect(logEmit).not.toHaveBeenCalled();
		});

		it("should send a fatal log with the error details Datadog Error Tracking groups by", async () => {
			const { recordFatalError, startTelemetry } = await _loadTelemetry(DATADOG_ENV);
			const error = new RangeError("port out of range");
			error.stack = "RangeError: port out of range\n    at bootstrap";

			startTelemetry();
			await recordFatalError({ event: "api.application.start.failed", error: error });

			expect(logEmit).toHaveBeenCalledWith({
				severityNumber: 21,
				severityText: "fatal",
				body: "api.application.start.failed: port out of range",
				attributes: {
					event: "api.application.start.failed",
					"error.kind": "RangeError",
					"error.message": "port out of range",
					"error.stack": "RangeError: port out of range\n    at bootstrap",
				},
			});
		});

		it("should describe values thrown without an Error object", async () => {
			const { recordFatalError, startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			await recordFatalError({ event: "api.application.start.failed", error: "plain failure" });

			expect(logEmit).toHaveBeenCalledWith(
				expect.objectContaining({
					attributes: {
						event: "api.application.start.failed",
						"error.kind": "UnknownError",
						"error.message": "plain failure",
					},
				}),
			);
		});

		it("should omit the stack when the error has none", async () => {
			const { recordFatalError, startTelemetry } = await _loadTelemetry(DATADOG_ENV);
			const error = new Error("no stack");
			delete error.stack;

			startTelemetry();
			await recordFatalError({ event: "api.application.start.failed", error: error });

			expect(logEmit).toHaveBeenCalledWith(
				expect.objectContaining({
					attributes: { event: "api.application.start.failed", "error.kind": "Error", "error.message": "no stack" },
				}),
			);
		});

		it("should flush buffered telemetry so the error is not lost when the process exits", async () => {
			const { recordFatalError, startTelemetry } = await _loadTelemetry(DATADOG_ENV);

			startTelemetry();
			await recordFatalError({ event: "api.application.start.failed", error: new Error("boom") });

			expect(sdkShutdown).toHaveBeenCalledOnce();
		});

		it("should report a failed flush on stderr instead of throwing", async () => {
			const { recordFatalError, startTelemetry } = await _loadTelemetry(DATADOG_ENV);
			sdkShutdown.mockRejectedValueOnce(new Error("network down"));

			startTelemetry();
			await recordFatalError({ event: "api.application.start.failed", error: new Error("boom") });

			expect(JSON.parse(String(vi.mocked(process.stderr.write).mock.calls[0]?.[0]))).toMatchObject({
				event: "api.telemetry.shutdown.failed",
				errorMessage: "network down",
			});
		});
	});
});
