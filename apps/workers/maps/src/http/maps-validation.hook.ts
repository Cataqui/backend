import { toValidationViolations } from "@cataqui/response";
import type { Hook } from "@hono/standard-validator";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { createMapsErrorResponse } from "./maps-error.response";
import type { MapsContext } from "./context";

export function createMapsValidationHook(params: {
	message: string;
	fallbackPath: string;
}): Hook<unknown, MapsContext, string> {
	return (result, context) => {
		if (result.success) return;
		return createMapsErrorResponse({
			context: context,
			errorCode: MapsErrorCode.INVALID_REQUEST,
			message: params.message,
			status: 400,
			violations: toValidationViolations({ issues: result.error }).map((violation) => ({
				path: violation.path.length === 0 ? [params.fallbackPath] : violation.path,
				message: violation.message,
			})),
		});
	};
}
