import { toValidationViolations } from "@cataqui/response";
import type { validator } from "hono-openapi";
import { RequestValidationError } from "./errors/request-validation.error";

export const validationHook: NonNullable<Parameters<typeof validator>[2]> = (result) => {
	if (result.success) return;

	throw new RequestValidationError({ violations: toValidationViolations({ issues: result.error }) });
};
