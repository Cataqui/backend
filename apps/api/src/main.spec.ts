import type { Mock } from "vitest";

const createNestApplication: Mock<(...args: unknown[]) => Promise<never>> = vi.hoisted(() => vi.fn());
const localEnvironmentFileExists = vi.hoisted(() => vi.fn(() => false));
const telemetryLifecycle = vi.hoisted(() => ({
	shutdown: vi.fn(async () => undefined),
	start: vi.fn(() => false),
}));

vi.mock("node:fs", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs")>()),
	existsSync: localEnvironmentFileExists,
}));

vi.mock("@nestjs/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/core")>()),
	NestFactory: { create: createNestApplication },
}));

vi.mock("./core/observability/telemetry.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("./core/observability/telemetry.js")>()),
	shutdownTelemetry: telemetryLifecycle.shutdown,
	startTelemetry: telemetryLifecycle.start,
}));

describe("application startup logging", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		createNestApplication.mockReset();
		localEnvironmentFileExists.mockReset();
		localEnvironmentFileExists.mockReturnValue(false);
		telemetryLifecycle.shutdown.mockReset();
		telemetryLifecycle.shutdown.mockResolvedValue(undefined);
		telemetryLifecycle.start.mockReset();
		telemetryLifecycle.start.mockReturnValue(false);
	});

	it("should write a structured fatal event when the application cannot start", async () => {
		const originalEnvironment = process.env["NODE_ENV"];
		const originalExitCode = process.exitCode;
		process.env["NODE_ENV"] = "development";
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		try {
			const { applicationStartupCompletion } = await import("./main");
			await applicationStartupCompletion;
			const writtenLog = JSON.parse(String(stderrWrite.mock.calls[0]?.[0])) as Record<string, unknown>;

			expect(writtenLog).toMatchObject({
				event: "api.application.start.failed",
				level: "fatal",
				errorName: "Error",
				errorMessage: "Startup dependency failed",
				errorStack: expect.stringContaining("Startup dependency failed"),
			});
		} finally {
			if (originalEnvironment === undefined) delete process.env["NODE_ENV"];
			else process.env["NODE_ENV"] = originalEnvironment;
			process.exitCode = originalExitCode;
		}
	});

	it("should let the application error boundary receive Nest initialization failures", async () => {
		const originalExitCode = process.exitCode;
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		const { applicationStartupCompletion } = await import("./main");
		await applicationStartupCompletion;
		process.exitCode = originalExitCode;

		expect(createNestApplication.mock.calls[0]?.[2]).toEqual({ abortOnError: false, bufferLogs: true });
	});

	it("should not write raw startup error details outside development", async () => {
		const originalEnvironment = process.env["NODE_ENV"];
		const originalExitCode = process.exitCode;
		process.env["NODE_ENV"] = "production";
		const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		try {
			const { applicationStartupCompletion } = await import("./main");
			await applicationStartupCompletion;
			const writtenLog = JSON.parse(String(stderrWrite.mock.calls[0]?.[0])) as Record<string, unknown>;

			expect({
				errorMessage: writtenLog["errorMessage"],
				errorName: writtenLog["errorName"],
				errorStack: writtenLog["errorStack"],
				event: writtenLog["event"],
			}).toEqual({
				errorMessage: undefined,
				errorName: "Error",
				errorStack: undefined,
				event: "api.application.start.failed",
			});
		} finally {
			if (originalEnvironment === undefined) delete process.env["NODE_ENV"];
			else process.env["NODE_ENV"] = originalEnvironment;
			process.exitCode = originalExitCode;
		}
	});

	it("should load the repository environment before telemetry starts", async () => {
		const originalExitCode = process.exitCode;
		localEnvironmentFileExists.mockReturnValueOnce(true);
		const loadEnvironmentFile = vi.spyOn(process, "loadEnvFile").mockImplementation(() => undefined);
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		try {
			const { applicationStartupCompletion } = await import("./main");
			await applicationStartupCompletion;

			expect(loadEnvironmentFile).toHaveBeenCalledWith(
				new URL("../../../.env", import.meta.url).pathname.replace(/\/$/, ""),
			);
		} finally {
			process.exitCode = originalExitCode;
		}
	});
});
