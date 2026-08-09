import { z } from "zod";
import { ErrorCode } from "./error-code.enum";
import { ErrorOutputSchema, toErrorOutput } from "./error-output";

describe("toErrorOutput", () => {
	it("should create a validated error response", () => {
		expect(
			toErrorOutput({
				errorCode: ErrorCode.POST_NOT_FOUND,
				message: "The requested post was not found",
				status: 404,
				requestId: "req-123",
				timestamp: "2026-05-28T10:00:00.000Z",
				endpoint: "/v1/posts/123",
			}),
		).toEqual({
			errorCode: ErrorCode.POST_NOT_FOUND,
			message: "The requested post was not found",
			status: 404,
			requestId: "req-123",
			timestamp: "2026-05-28T10:00:00.000Z",
			endpoint: "/v1/posts/123",
		});
	});

	it("should reject undeclared values", () => {
		expect(() =>
			ErrorOutputSchema.parse({
				errorCode: ErrorCode.POST_NOT_FOUND,
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
			toErrorOutput({
				errorCode: ErrorCode.VALIDATION_ERROR,
				message: "The request contains invalid fields.",
				status: 400,
				requestId: "req-123",
				timestamp: "2026-05-28T10:00:00.000Z",
				endpoint: "/v1/jobs/drafts",
				violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
			}),
		).toMatchObject({
			violations: [{ path: ["payment", "minAmount"], message: "must be greater than 0" }],
		});
	});

	it("should document validation violations in the generated JSON schema", () => {
		const jsonSchema = z.toJSONSchema(ErrorOutputSchema) as {
			properties?: { violations?: { description?: string } };
		};

		expect(jsonSchema.properties?.violations?.description).toBe(
			"Request validation failures; absent for errors unrelated to request fields",
		);
	});
});
