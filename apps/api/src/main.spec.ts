import type { NestFactory } from "@nestjs/core";
import * as td from "testdouble";

afterEach(() => td.reset());

const _startup = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { create: td.func<typeof NestFactory.create>() };
});

vi.mock("@nestjs/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/core")>()),
	NestFactory: { create: _startup.create },
}));

vi.mock("./app.module", () => ({ AppModule: class AppModule {} }));

describe("application startup logging", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("should write a structured fatal event when the application cannot start", async () => {
		const originalExitCode = process.exitCode;
		const stderrWrite = td.replace(process.stderr, "write");
		td.when(stderrWrite(td.matchers.anything())).thenReturn(true);
		td.when(_startup.create(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			times: 1,
		}).thenReject(new Error("Startup dependency failed"));

		try {
			await import("./main");
			await vi.waitUntil(() => td.explain(stderrWrite).callCount > 0, { timeout: 5_000 });
			const writtenLog = JSON.parse(String(td.explain(stderrWrite).calls[0]?.args[0])) as Record<string, unknown>;
			expect(writtenLog).toMatchObject({
				event: "api.application.start.failed",
				level: "fatal",
				errorName: "Error",
				errorMessage: "Startup dependency failed",
				errorStack: expect.stringContaining("Startup dependency failed"),
			});
		} finally {
			process.exitCode = originalExitCode;
		}
	});

	it("should let the application error boundary receive Nest initialization failures", async () => {
		const originalExitCode = process.exitCode;
		const stderrWrite = td.replace(process.stderr, "write");
		td.when(stderrWrite(td.matchers.anything())).thenReturn(true);
		td.when(_startup.create(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			times: 1,
		}).thenReject(new Error("Startup dependency failed"));

		try {
			await import("./main");
			await vi.waitUntil(() => td.explain(stderrWrite).callCount > 0, { timeout: 5_000 });
			expect(td.explain(_startup.create).calls[0]?.args[2]).toEqual({ abortOnError: false });
		} finally {
			process.exitCode = originalExitCode;
		}
	});

	it("should emit only warnings and errors through Nest in production", async () => {
		const originalEnvironment = process.env["ENVIRONMENT"];
		const originalExitCode = process.exitCode;
		process.env["ENVIRONMENT"] = "production";
		const stderrWrite = td.replace(process.stderr, "write");
		td.when(stderrWrite(td.matchers.anything())).thenReturn(true);
		td.when(_startup.create(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			times: 1,
		}).thenReject(new Error("Startup dependency failed"));

		try {
			await import("./main");
			await vi.waitUntil(() => td.explain(stderrWrite).callCount > 0, { timeout: 5_000 });
			expect(td.explain(_startup.create).calls[0]?.args[2]).toEqual({
				abortOnError: false,
				logger: ["error", "warn", "fatal"],
			});
		} finally {
			if (originalEnvironment === undefined) delete process.env["ENVIRONMENT"];
			else process.env["ENVIRONMENT"] = originalEnvironment;
			process.exitCode = originalExitCode;
		}
	});
});
