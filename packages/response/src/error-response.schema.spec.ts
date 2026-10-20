import { z } from "zod";
import { createErrorResponseSchema } from "./error-response.schema";

const _errorCode = {
	APPLICATION_SPECIFIC_FAILURE: "APPLICATION_SPECIFIC_FAILURE",
	POST_NOT_FOUND: "POST_NOT_FOUND",
	VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;
const _schema = createErrorResponseSchema({ errorCodeSchema: z.enum(_errorCode) });

const _output = {
	errorCode: "APPLICATION_SPECIFIC_FAILURE",
	message: "The operation failed.",
	status: 400,
	requestId: "request-1",
	timestamp: "2026-10-19T12:00:00.000Z",
	endpoint: "/v1/resource",
} satisfies z.input<typeof _schema>;

it.each(Object.values(_errorCode))("accepts the application-owned code %s", (errorCode) => {
	expect(_schema.parse({ ..._output, errorCode: errorCode }).errorCode).toBe(errorCode);
});
it("rejects codes belonging to another application", () => {
	const other = createErrorResponseSchema({ errorCodeSchema: z.literal("OTHER_APP_FAILURE") });
	expect(other.safeParse(_output).success).toBe(false);
	expect(_schema.safeParse({ ..._output, errorCode: "OTHER_APP_FAILURE" }).success).toBe(false);
});

it.each([400, 404, 503, 599])("accepts HTTP error status %s", (status) => {
	expect(_schema.parse({ ..._output, status: status }).status).toBe(status);
});

it.each([
	{ errorCode: "" },
	{ errorCode: 123 },
	{ message: null },
	{ status: 399 },
	{ status: 600 },
	{ status: 400.5 },
	{ requestId: 123 },
	{ timestamp: "not-a-datetime" },
	{ endpoint: null },
	{ violations: [] },
	{ violations: [{ path: ["field", -1], message: "Invalid value" }] },
	{ violations: [{ path: ["field"], message: 123 }] },
])("rejects invalid HTTP error fields %j", (invalid) => {
	expect(_schema.safeParse({ ..._output, ...invalid }).success).toBe(false);
});

it.each(["errorCode", "message", "status", "requestId", "timestamp", "endpoint"])("requires the %s field", (field) => {
	expect(_schema.safeParse({ ..._output, [field]: undefined }).success).toBe(false);
});

it("documents the application's error-code enum", () => {
	const schema = z.toJSONSchema(_schema);
	expect(schema.properties?.["errorCode"]).toEqual({
		type: "string",
		enum: Object.values(_errorCode),
		description: "Stable error code identifying the problem",
	});
});

describe("createErrorResponseSchema", () => {
	it("should create a validated error response", () => {
		expect(
			_schema.parse({
				errorCode: "POST_NOT_FOUND",
				message: "The requested post was not found",
				status: 404,
				requestId: "req-123",
				timestamp: "2026-05-28T10:00:00.000Z",
				endpoint: "/v1/posts/123",
			}),
		).toEqual({
			errorCode: "POST_NOT_FOUND",
			message: "The requested post was not found",
			status: 404,
			requestId: "req-123",
			timestamp: "2026-05-28T10:00:00.000Z",
			endpoint: "/v1/posts/123",
		});
	});

	it("should reject undeclared values", () => {
		expect(() =>
			_schema.parse({
				errorCode: "POST_NOT_FOUND",
				message: "The requested post was not found",
				status: 404,
				requestId: "req-123",
				timestamp: "2026-05-28T10:00:00.000Z",
				endpoint: "/v1/posts/123",
				stack: "secret",
			}),
		).toThrow();
	});

	it("should expose structured validation violations when supplied", () => {
		expect(
			_schema.parse({
				errorCode: "VALIDATION_ERROR",
				message: "The request contains invalid fields.",
				status: 400,
				requestId: "req-123",
				timestamp: "2026-05-28T10:00:00.000Z",
				endpoint: "/v1/jobs",
				violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
			}),
		).toMatchObject({
			violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
		});
	});

	it("should document validation violations in the generated JSON schema", () => {
		const jsonSchema = z.toJSONSchema(_schema) as {
			properties?: { violations?: { description?: string } };
		};

		expect(jsonSchema.properties?.violations?.description).toBe(
			"Request validation failures; absent for errors unrelated to request fields",
		);
	});
});

it("preserves the application's code type in the exported error contract", () => {
	expectTypeOf<z.infer<typeof _schema>>().toEqualTypeOf<
		import("./index").ErrorResponse<(typeof _errorCode)[keyof typeof _errorCode]>
	>();
});
