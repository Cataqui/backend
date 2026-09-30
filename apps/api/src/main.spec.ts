import type { ConsoleLogger } from "@nestjs/common";
import type { Mock } from "vitest";

const createNestApplication: Mock<(...args: unknown[]) => Promise<never>> = vi.hoisted(() => vi.fn());
const startTelemetry = vi.hoisted(() => vi.fn());
const recordFatalError = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("./core/observability/telemetry", () => ({
	startTelemetry: startTelemetry,
	recordFatalError: recordFatalError,
}));

vi.mock("@nestjs/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/core")>()),
	NestFactory: { create: createNestApplication },
}));

describe("application startup logging", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		createNestApplication.mockReset();
		startTelemetry.mockReset();
		recordFatalError.mockReset().mockResolvedValue(undefined);
	});

	it("should start telemetry before Nest is created so HTTP, Nest, and Prisma instrumentation can attach", async () => {
		const originalExitCode = process.exitCode;
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		await import("./main");
		await vi.waitFor(() => expect(createNestApplication).toHaveBeenCalled(), { timeout: 5_000 });
		process.exitCode = originalExitCode;

		expect(startTelemetry.mock.invocationCallOrder[0]).toBeLessThan(
			createNestApplication.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("should send the startup failure to Datadog before the process exits", async () => {
		const originalExitCode = process.exitCode;
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const startupError = new Error("Startup dependency failed");
		createNestApplication.mockRejectedValueOnce(startupError);

		await import("./main");
		await vi.waitFor(() => expect(recordFatalError).toHaveBeenCalled(), { timeout: 5_000 });
		process.exitCode = originalExitCode;

		expect(recordFatalError).toHaveBeenCalledWith({ event: "api.application.start.failed", error: startupError });
	});

	it("should write a structured fatal event when the application cannot start", async () => {
		const originalExitCode = process.exitCode;
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		await import("./main");
		await vi.waitFor(() => expect(stderrWrite).toHaveBeenCalled(), { timeout: 5_000 });
		const writtenLog = JSON.parse(String(stderrWrite.mock.calls[0]?.[0])) as Record<string, unknown>;
		process.exitCode = originalExitCode;

		expect(writtenLog).toMatchObject({
			event: "api.application.start.failed",
			level: "fatal",
			errorName: "Error",
			errorMessage: "Startup dependency failed",
			errorStack: expect.stringContaining("Startup dependency failed"),
		});
	});

	it("should let the application error boundary receive Nest initialization failures", async () => {
		const originalExitCode = process.exitCode;
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		await import("./main");
		await vi.waitFor(() => expect(createNestApplication).toHaveBeenCalled(), { timeout: 5_000 });
		process.exitCode = originalExitCode;

		expect(createNestApplication.mock.calls[0]?.[2]).toMatchObject({ abortOnError: false });
	});

	it("should log through the telemetry logger so warnings and errors reach Datadog", async () => {
		const originalExitCode = process.exitCode;
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));
		const { TelemetryLogger } = await import("./core/observability/telemetry-logger");

		await import("./main");
		await vi.waitFor(() => expect(createNestApplication).toHaveBeenCalled(), { timeout: 5_000 });
		process.exitCode = originalExitCode;

		expect((createNestApplication.mock.calls[0]?.[2] as { logger: unknown } | undefined)?.logger).toBeInstanceOf(
			TelemetryLogger,
		);
	});

	it("should emit only warnings and errors through Nest in production", async () => {
		const originalEnvironment = process.env["NODE_ENV"];
		const originalExitCode = process.exitCode;
		process.env["NODE_ENV"] = "production";
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		try {
			await import("./main");
			await vi.waitFor(() => expect(createNestApplication).toHaveBeenCalled(), { timeout: 5_000 });

			const logger = (createNestApplication.mock.calls[0]?.[2] as { logger: ConsoleLogger } | undefined)?.logger;

			expect(
				(["log", "debug", "verbose", "warn", "error", "fatal"] as const).filter((level) =>
					logger?.isLevelEnabled(level),
				),
			).toEqual(["warn", "error", "fatal"]);
		} finally {
			if (originalEnvironment === undefined) delete process.env["NODE_ENV"];
			else process.env["NODE_ENV"] = originalEnvironment;
			process.exitCode = originalExitCode;
		}
	});
});
