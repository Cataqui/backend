import {
	getSourceSafeErrorTelemetryFields,
	getTelemetryHttpRequestMethod,
	getWorkerVersion,
	ObservabilityEventConstants,
	TelemetryHttpRequestMethod,
} from "./index";

describe("observability contracts", () => {
	it("should expose unique bounded backend event names", () => {
		const eventNames = Object.values(ObservabilityEventConstants);

		expect({
			allNamesAreBounded: eventNames.every((eventName) => /^[a-z][a-z0-9_.]{0,127}$/.test(eventName)),
			uniqueEventNameCount: new Set(eventNames).size,
			eventNameCount: eventNames.length,
		}).toEqual({
			allNamesAreBounded: true,
			uniqueEventNameCount: eventNames.length,
			eventNameCount: eventNames.length,
		});
	});

	it.each(Object.values(TelemetryHttpRequestMethod).filter((method) => method !== TelemetryHttpRequestMethod.OTHER))(
		"should retain the bounded %s request method",
		(requestMethod) => {
			expect(getTelemetryHttpRequestMethod({ requestMethod: requestMethod.toLowerCase() })).toBe(requestMethod);
		},
	);

	it("should replace an extension request method with the bounded fallback", () => {
		expect(getTelemetryHttpRequestMethod({ requestMethod: "CUSTOM-private-value" })).toBe(
			TelemetryHttpRequestMethod.OTHER,
		);
	});

	it("should retain bounded source frames without retaining an arbitrary error message", () => {
		const fields = getSourceSafeErrorTelemetryFields({
			error: new Error("provider response included a private credential"),
		});

		expect({
			errorName: fields.errorName,
			hasSourceFrame: fields.errorStackFrames?.includes("observability-contracts.spec.ts"),
			leaksMessage: fields.errorStackFrames?.includes("private credential") ?? false,
		}).toEqual({ errorName: "Error", hasSourceFrame: true, leaksMessage: false });
	});

	it("should replace an unbounded error name", () => {
		const error = new Error("failure");
		error.name = "invalid name with customer input";

		expect(getSourceSafeErrorTelemetryFields({ error: error })).toEqual(
			expect.objectContaining({ errorName: "UnknownError" }),
		);
	});

	it("should limit exported frames and total stack size", () => {
		const errorStack = [
			"Error: private",
			...Array.from({ length: 40 }, (_, index) => `    at frame${index} (${"x".repeat(500)})`),
		].join("\n");

		const fields = getSourceSafeErrorTelemetryFields({ error: null, errorStack: errorStack });

		expect({
			frameCountWithinLimit: (fields.errorStackFrames?.split("\n").length ?? Number.POSITIVE_INFINITY) <= 20,
			stackLength: fields.errorStackFrames?.length,
		}).toEqual({ frameCountWithinLimit: true, stackLength: 8_192 });
	});

	it.each([
		{ tag: "immutable-tag", expectedVersion: "immutable-tag" },
		{ tag: "", expectedVersion: "immutable-version-id" },
	])("should resolve the $expectedVersion Worker version", ({ expectedVersion, tag }) => {
		expect(getWorkerVersion({ metadata: { id: "immutable-version-id", tag: tag } })).toBe(expectedVersion);
	});
});
