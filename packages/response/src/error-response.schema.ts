import { z } from "zod";
import { ValidationViolationSchema } from "./validation-violation.schema";

export function createErrorResponseSchema<T extends z.ZodType<string>>(params: {
	errorCodeSchema: T;
}): z.ZodObject<
	{
		errorCode: T;
		message: z.ZodString;
		status: z.ZodNumber;
		requestId: z.ZodString;
		timestamp: z.ZodISODateTime;
		endpoint: z.ZodString;
		violations: z.ZodOptional<z.ZodArray<typeof ValidationViolationSchema>>;
	},
	z.core.$strict
> {
	return z.strictObject({
		errorCode: params.errorCodeSchema.describe("Stable error code identifying the problem"),
		message: z.string().describe("Human-readable error message"),
		status: z.int().min(400).max(599).describe("HTTP status code"),
		requestId: z.string().describe("Unique request identifier for tracing"),
		timestamp: z.iso.datetime().describe("ISO 8601 timestamp of when the error occurred"),
		endpoint: z.string().describe("The requested endpoint path"),
		violations: z
			.array(ValidationViolationSchema)
			.min(1)
			.optional()
			.describe("Request validation failures; absent for errors unrelated to request fields"),
	});
}

export type ErrorResponse<T extends string> = z.infer<ReturnType<typeof createErrorResponseSchema<z.ZodType<T>>>>;
