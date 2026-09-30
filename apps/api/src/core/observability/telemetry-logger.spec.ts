import { SeverityNumber } from "@opentelemetry/api-logs";
import { TelemetryLogger } from "./telemetry-logger";

const logEmit = vi.hoisted(() => vi.fn());

vi.mock("@opentelemetry/api-logs", async (importOriginal) => ({
	...(await importOriginal<typeof import("@opentelemetry/api-logs")>()),
	logs: { getLogger: () => ({ emit: logEmit }) },
}));

describe("TelemetryLogger", () => {
	beforeEach(() => {
		logEmit.mockClear();
		vi.spyOn(process.stdout, "write").mockReturnValue(true);
		vi.spyOn(process.stderr, "write").mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should still print to the console so Cloudflare logs keep working", () => {
		new TelemetryLogger().warn("Slow provider response");

		expect(process.stdout.write).toHaveBeenCalled();
	});

	it("should send warnings to Datadog", () => {
		new TelemetryLogger().warn("Slow provider response", "AiService");

		expect(logEmit).toHaveBeenCalledWith({
			severityNumber: SeverityNumber.WARN,
			severityText: "warn",
			body: "Slow provider response",
			attributes: { "logger.name": "AiService" },
		});
	});

	it("should send errors with their stack so Datadog Error Tracking can group them", () => {
		const stack = "TypeError: boom\n    at JobService.create (job.service.ts:10:5)";

		new TelemetryLogger().error("Unhandled error: boom", stack, "HttpExceptionFilter");

		expect(logEmit).toHaveBeenCalledWith({
			severityNumber: SeverityNumber.ERROR,
			severityText: "error",
			body: "Unhandled error: boom",
			attributes: {
				"logger.name": "HttpExceptionFilter",
				"error.message": "Unhandled error: boom",
				"error.stack": stack,
			},
		});
	});

	it("should describe logged Error objects with their type, message, and stack", () => {
		const error = new RangeError("limit out of range");
		error.stack = "RangeError: limit out of range\n    at FeedService.list";

		new TelemetryLogger().error(error);

		expect(logEmit).toHaveBeenCalledWith(
			expect.objectContaining({
				body: "limit out of range",
				attributes: {
					"error.kind": "RangeError",
					"error.message": "limit out of range",
					"error.stack": "RangeError: limit out of range\n    at FeedService.list",
				},
			}),
		);
	});

	it("should describe logged Error objects without a stack", () => {
		const error = new Error("no stack");
		delete error.stack;

		new TelemetryLogger().error(error);

		expect(logEmit).toHaveBeenCalledWith(
			expect.objectContaining({ attributes: { "error.kind": "Error", "error.message": "no stack" } }),
		);
	});

	it("should send fatal logs as fatal", () => {
		new TelemetryLogger().fatal("Cannot reach the database");

		expect(logEmit).toHaveBeenCalledWith(expect.objectContaining({ severityNumber: SeverityNumber.FATAL }));
	});

	it("should render object messages as readable text", () => {
		new TelemetryLogger().warn({ jobId: "7f3c", attempts: 3 });

		expect(logEmit).toHaveBeenCalledWith(expect.objectContaining({ body: "{ jobId: '7f3c', attempts: 3 }" }));
	});

	it.each(["log", "debug", "verbose"] as const)("should keep %s output out of Datadog to limit log cost", (level) => {
		new TelemetryLogger()[level]("Server running");

		expect(logEmit).not.toHaveBeenCalled();
	});

	it("should not send levels that are disabled on the logger", () => {
		new TelemetryLogger({ logLevels: ["error", "fatal"] }).warn("Slow provider response");

		expect(logEmit).not.toHaveBeenCalled();
	});
});
