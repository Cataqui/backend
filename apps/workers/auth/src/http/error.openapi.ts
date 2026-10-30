import type { z } from "zod";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { resolver } from "hono-openapi";
import { AuthErrorResponseOutputSchema } from "./auth-error-response-output.schema";

export const authErrorResponse = {
	description:
		"Application error. Inspect status and errorCode; validation failures include field violations. Diagnostic messages are for developers; clients localize user-facing copy.",
	content: { "application/json": { schema: resolver(AuthErrorResponseOutputSchema) } },
};

export const authInternalErrorExample = {
	errorCode: AppErrorCode.INTERNAL_ERROR,
	message: "An internal error occurred.",
	status: 500,
	requestId: "example-request",
	timestamp: "2026-10-30T12:00:00.000Z",
	endpoint: "/v1/sessions/current",
} satisfies z.output<typeof AuthErrorResponseOutputSchema>;
