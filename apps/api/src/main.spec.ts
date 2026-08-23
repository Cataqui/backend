import type { Mock } from "vitest";

const createNestApplication: Mock<(...args: unknown[]) => Promise<never>> = vi.hoisted(() => vi.fn());

vi.mock("@nestjs/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/core")>()),
	NestFactory: { create: createNestApplication },
}));

describe("application startup logging", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		createNestApplication.mockReset();
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

		expect(createNestApplication.mock.calls[0]?.[2]).toEqual({ abortOnError: false });
	});

	it("should emit only warnings and errors through Nest in production", async () => {
		const originalEnvironment = process.env["NODE_ENV"];
		const originalExitCode = process.exitCode;
		process.env["NODE_ENV"] = "production";
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		createNestApplication.mockRejectedValueOnce(new Error("Startup dependency failed"));

		await import("./main");
		await vi.waitFor(() => expect(createNestApplication).toHaveBeenCalled(), { timeout: 5_000 });
		if (originalEnvironment === undefined) delete process.env["NODE_ENV"];
		else process.env["NODE_ENV"] = originalEnvironment;
		process.exitCode = originalExitCode;

		expect(createNestApplication.mock.calls[0]?.[2]).toEqual({
			abortOnError: false,
			logger: ["error", "warn", "fatal"],
		});
	});
});
