import type { Hook } from "@hono/standard-validator";
import { MapsErrorCode } from "./maps-error-code.enum";
import { createMapsErrorResponse } from "./maps-error.response";
import type { IMapsHonoEnvironment } from "./maps-hono-environment.interface";

export function createMapsValidationHook(params: {
	message: string;
	fallbackPath: string;
}): Hook<unknown, IMapsHonoEnvironment, string> {
	return (result, context) => {
		if (result.success) return;
		return createMapsErrorResponse({
			context: context,
			errorCode: MapsErrorCode.INVALID_REQUEST,
			message: params.message,
			status: 400,
			violations: result.error.map((issue) => ({
				path: issue.path?.map((part) => (typeof part === "object" ? part.key : part)).join(".") || params.fallbackPath,
				message: issue.message,
			})),
		});
	};
}
