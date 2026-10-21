import { resolver } from "hono-openapi";
import { AuthErrorResponseOutputSchema } from "./auth-error-response-output.schema";

export const authErrorResponse = {
	description:
		"Application error. Inspect status and errorCode; validation failures include field violations. Diagnostic messages are for developers; clients localize user-facing copy.",
	content: { "application/json": { schema: resolver(AuthErrorResponseOutputSchema) } },
};
