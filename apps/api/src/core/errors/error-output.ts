import { z } from "zod";
import { ValidationViolationSchema } from "../validation/validation-violation.schema";
import { ErrorCode } from "./error-code.enum";

export const ErrorOutputSchema = z
	.object({
		errorCode: z.enum(ErrorCode).describe("Stable error code identifying the problem"),
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
	})
	.strict()
	.meta({ id: "ErrorOutput" });

export function toErrorOutput(params: z.input<typeof ErrorOutputSchema>): z.infer<typeof ErrorOutputSchema> {
	return ErrorOutputSchema.parse(params);
}
