import type { z } from "zod";
import { ApiErrorResponseOutputSchema } from "./api-error-response-output.schema";
import { ErrorCode } from "./error-code.enum";

export const apiInternalErrorExample = {
	errorCode: ErrorCode.INTERNAL_ERROR,
	message: "An unexpected error occurred",
	status: 500,
	requestId: "example-request",
	timestamp: "2026-10-30T12:00:00.000Z",
	endpoint: "/v1/feed",
} satisfies z.output<typeof ApiErrorResponseOutputSchema>;

export const apiValidationErrorExample = {
	...apiInternalErrorExample,
	errorCode: ErrorCode.VALIDATION_ERROR,
	message: "The request contains invalid fields.",
	status: 400,
	violations: [{ path: ["name"], message: "name must contain at least one non-whitespace character" }],
} satisfies z.output<typeof ApiErrorResponseOutputSchema>;
