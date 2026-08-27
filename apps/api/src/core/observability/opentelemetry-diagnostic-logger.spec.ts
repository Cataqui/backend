import { createOpenTelemetryDiagnosticLogger } from "./opentelemetry-diagnostic-logger";

describe("OpenTelemetry diagnostic logger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should classify exporter authentication errors without persisting secret diagnostic details", () => {
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const logger = createOpenTelemetryDiagnosticLogger();

		logger.error(
			"OTLP exporter received 401 from https://cloudflare.integrations.otlp.datadoghq.com/v1/traces",
			new Error("dd-api-key=super-secret-provider-response"),
		);

		const diagnosticEvent = JSON.parse(String(stderrWrite.mock.calls[0]?.[0])) as Record<string, unknown>;
		expect({
			diagnosticEvent: diagnosticEvent,
			leaksDiagnosticDetails: /super-secret|dd-api-key|datadoghq\.com|provider-response/.test(
				JSON.stringify(diagnosticEvent),
			),
		}).toEqual({
			diagnosticEvent: expect.objectContaining({
				diagnosticCategory: "AUTHENTICATION",
				errorName: "Error",
				event: "api.telemetry.diagnostic",
				level: "error",
				severity: "ERROR",
			}),
			leaksDiagnosticDetails: false,
		});
	});

	it("should emit a bounded warning category for exporter timeouts", () => {
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const logger = createOpenTelemetryDiagnosticLogger();

		logger.warn("Periodic metric export timed out after its deadline");

		expect(JSON.parse(String(stderrWrite.mock.calls[0]?.[0]))).toMatchObject({
			diagnosticCategory: "TIMEOUT",
			event: "api.telemetry.diagnostic",
			level: "warn",
			severity: "WARN",
		});
	});

	it.each([
		{ diagnosticCategory: "PAYLOAD_TOO_LARGE", message: "OTLP export received 413" },
		{ diagnosticCategory: "RATE_LIMITED", message: "OTLP export received too many requests" },
		{ diagnosticCategory: "NETWORK", message: "OTLP export socket failed" },
		{ diagnosticCategory: "UNKNOWN", message: "OTLP export failed" },
	] as const)("should classify $diagnosticCategory exporter diagnostics", ({ diagnosticCategory, message }) => {
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const logger = createOpenTelemetryDiagnosticLogger();

		logger.warn(message, { ignoredProviderDetails: true });

		expect(JSON.parse(String(stderrWrite.mock.calls[0]?.[0]))).toMatchObject({
			diagnosticCategory: diagnosticCategory,
			event: "api.telemetry.diagnostic",
			level: "warn",
			severity: "WARN",
		});
	});

	it("should keep verbose diagnostic levels disabled", () => {
		const logger = createOpenTelemetryDiagnosticLogger();

		expect({
			debug: logger.debug("debug"),
			info: logger.info("info"),
			verbose: logger.verbose("verbose"),
		}).toEqual({ debug: undefined, info: undefined, verbose: undefined });
	});
});
