import { SeverityNumber, type Logger } from "@opentelemetry/api-logs";
import type { Logger as PinoLogger } from "pino";
import { StructuredLogger } from "./structured-logger";

function _createLoggerHarness(params: { includeFullDetails?: boolean; telemetryEnabled: boolean }) {
	const emitTelemetryLog = vi.fn();
	const pinoLogger = {
		debug: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		info: vi.fn(),
		trace: vi.fn(),
		warn: vi.fn(),
	} as unknown as PinoLogger;
	const telemetryLogger = {
		emit: emitTelemetryLog,
		enabled: vi.fn(() => params.telemetryEnabled),
	} as unknown as Logger;

	return {
		emitTelemetryLog: emitTelemetryLog,
		logger: new StructuredLogger({
			includeFullDetails: params.includeFullDetails ?? true,
			logger: pinoLogger,
			telemetryLogger: telemetryLogger,
		}),
		pinoLogger: pinoLogger,
		telemetryLogger: telemetryLogger,
	};
}

describe("StructuredLogger", () => {
	it("should emit Nest informational messages as structured Pino logs", () => {
		const { logger, pinoLogger } = _createLoggerHarness({ telemetryEnabled: false });

		logger.log("Application started", "Bootstrap");

		expect(pinoLogger.info).toHaveBeenCalledWith({ context: "Bootstrap" }, "Application started");
	});

	it("should preserve explicitly structured event fields", () => {
		const { logger, pinoLogger, telemetryLogger } = _createLoggerHarness({ telemetryEnabled: true });

		logger.log({ event: "api.http.request.completed", statusCode: 200 }, "HTTP");

		expect({
			pinoCall: vi.mocked(pinoLogger.info).mock.calls[0],
			telemetryCall: vi.mocked(telemetryLogger.emit).mock.calls[0],
		}).toEqual({
			pinoCall: [
				{ context: "HTTP", event: "api.http.request.completed", statusCode: 200 },
				"api.http.request.completed",
			],
			telemetryCall: [
				{
					attributes: { context: "HTTP", event: "api.http.request.completed", statusCode: 200 },
					body: "api.http.request.completed",
					context: expect.any(Object),
					eventName: "api.http.request.completed",
					severityNumber: SeverityNumber.INFO,
					severityText: "info",
				},
			],
		});
	});

	it("should omit unapproved structured fields from direct OpenTelemetry log export", () => {
		const { logger, telemetryLogger } = _createLoggerHarness({ telemetryEnabled: true });

		logger.error({ event: "api.provider.failed", errorName: "ProviderError", token: "private-value" }, "Provider");

		expect(telemetryLogger.emit).toHaveBeenCalledWith(
			expect.objectContaining({
				attributes: {
					context: "Provider",
					errorName: "ProviderError",
					event: "api.provider.failed",
				},
				body: "api.provider.failed",
				severityNumber: SeverityNumber.ERROR,
				severityText: "error",
			}),
		);
	});

	it("should emit only bounded fields and messages outside development", () => {
		const { logger, pinoLogger } = _createLoggerHarness({ includeFullDetails: false, telemetryEnabled: false });

		logger.error({ event: "api.provider.failed", errorName: "ProviderError", token: "private-value" }, "Provider");

		expect({
			leaksPrivateValue: JSON.stringify(vi.mocked(pinoLogger.error).mock.calls).includes("private"),
			pinoCall: vi.mocked(pinoLogger.error).mock.calls[0],
		}).toEqual({
			leaksPrivateValue: false,
			pinoCall: [
				{ context: "Provider", errorName: "ProviderError", event: "api.provider.failed" },
				"api.provider.failed",
			],
		});
	});

	it("should keep only stack frames in a dedicated structured field", () => {
		const { logger, pinoLogger } = _createLoggerHarness({ telemetryEnabled: false });

		logger.error("Application failed", "Error: Application failed\n at bootstrap", "Bootstrap");

		expect(pinoLogger.error).toHaveBeenCalledWith(
			{ context: "Bootstrap", errorName: "UnknownError", errorStackFrames: " at bootstrap" },
			"Application failed",
		);
	});

	it("should map verbose Nest logs to the trace level", () => {
		const { logger, pinoLogger } = _createLoggerHarness({ telemetryEnabled: false });

		logger.verbose("Verbose event", "Diagnostics");

		expect(pinoLogger.trace).toHaveBeenCalledWith({ context: "Diagnostics" }, "Verbose event");
	});

	it("should map debug and fatal Nest logs to their matching Pino and telemetry severities", () => {
		const { logger, pinoLogger, telemetryLogger } = _createLoggerHarness({ telemetryEnabled: true });

		logger.debug("Debug event", "Diagnostics");
		logger.fatal("Fatal event", "Bootstrap");

		expect({
			debugCall: vi.mocked(pinoLogger.debug).mock.calls[0],
			fatalCall: vi.mocked(pinoLogger.fatal).mock.calls[0],
			telemetryCalls: vi.mocked(telemetryLogger.emit).mock.calls,
		}).toEqual({
			debugCall: [{ context: "Diagnostics" }, "Debug event"],
			fatalCall: [{ context: "Bootstrap" }, "Fatal event"],
			telemetryCalls: [
				[expect.objectContaining({ severityNumber: SeverityNumber.DEBUG, severityText: "debug" })],
				[expect.objectContaining({ severityNumber: SeverityNumber.FATAL, severityText: "fatal" })],
			],
		});
	});

	it("should export an Error without its message and without requiring a logging context", () => {
		const { emitTelemetryLog, logger, pinoLogger, telemetryLogger } = _createLoggerHarness({
			telemetryEnabled: true,
		});
		const error = new Error("private provider response");

		logger.error(error);

		expect({
			leaksPrivateMessage: JSON.stringify(emitTelemetryLog.mock.calls).includes("private provider response"),
			pinoCall: vi.mocked(pinoLogger.error).mock.calls[0],
			telemetryCall: vi.mocked(telemetryLogger.emit).mock.calls[0]?.[0],
		}).toEqual({
			leaksPrivateMessage: false,
			pinoCall: [
				{ errorName: "Error", errorStackFrames: expect.stringContaining("structured-logger.spec.ts") },
				"Error",
			],
			telemetryCall: expect.objectContaining({
				attributes: { errorName: "Error", errorStackFrames: expect.stringContaining("structured-logger.spec.ts") },
				body: "application.log",
			}),
		});
	});

	it("should use a generic contextual body for invalid event names and omit non-primitive safe attributes", () => {
		const { logger, pinoLogger, telemetryLogger } = _createLoggerHarness({ telemetryEnabled: true });

		logger.warn({ event: "INVALID EVENT", requestId: { privateValue: "customer-id" }, status: true }, "HTTP");

		expect({
			pinoCall: vi.mocked(pinoLogger.warn).mock.calls[0],
			telemetryCall: vi.mocked(telemetryLogger.emit).mock.calls[0],
		}).toEqual({
			pinoCall: [
				{ context: "HTTP", event: "INVALID EVENT", requestId: { privateValue: "customer-id" }, status: true },
				"structured.log.event",
			],
			telemetryCall: [
				{
					attributes: { context: "HTTP", event: "INVALID EVENT", status: true },
					body: "HTTP.log",
					context: expect.any(Object),
					severityNumber: SeverityNumber.WARN,
					severityText: "warn",
				},
			],
		});
	});
});
