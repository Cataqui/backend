import { getDevelopmentErrorLogFields, getSafeErrorTelemetryFields } from "./safe-error-telemetry";

describe("getSafeErrorTelemetryFields", () => {
	it("should preserve the error class and stack frames without exporting the arbitrary message", () => {
		const error = new Error("provider response included sensitive customer data");

		const fields = getSafeErrorTelemetryFields({ error: error });

		expect({
			errorName: fields.errorName,
			hasStackFrames: fields.errorStackFrames?.includes("safe-error-telemetry.spec.ts"),
			leaksMessage: fields.errorStackFrames?.includes("sensitive customer data") ?? false,
		}).toEqual({ errorName: "Error", hasStackFrames: true, leaksMessage: false });
	});

	it("should replace an unbounded custom error name", () => {
		const error = new Error("failure");
		error.name = "invalid error name containing spaces and user input";

		const fields = getSafeErrorTelemetryFields({ error: error });

		expect(fields.errorName).toBe("UnknownError");
	});
});

describe("getDevelopmentErrorLogFields", () => {
	it("should describe non-Error objects for local debugging", () => {
		expect(
			getDevelopmentErrorLogFields({ error: { issues: [{ path: ["data"], message: "Invalid output" }] } }),
		).toEqual({
			errorDetails: "{\n  issues: [ { path: [ 'data' ], message: 'Invalid output' } ]\n}",
			errorMessage: "A non-Error object was thrown",
		});
	});

	it("should preserve the complete error message, stack, and cause for local debugging", () => {
		const cause = new Error("database connection was refused");
		const error = new Error("feed query failed", { cause: cause });

		const fields = getDevelopmentErrorLogFields({ error: error });

		expect(fields).toEqual({
			errorMessage: "feed query failed",
			errorStack: expect.stringContaining("Error: feed query failed"),
			errorCause: expect.stringContaining("Error: database connection was refused"),
		});
	});

	it("should describe a non-Error throwable without throwing while logging it", () => {
		expect(getDevelopmentErrorLogFields({ error: "feed query rejected" })).toEqual({
			errorMessage: "feed query rejected",
		});
	});
});
