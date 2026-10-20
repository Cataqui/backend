import { type ValidationViolation } from "@cataqui/response";
import { MapsErrorResponseOutputSchema } from "./maps-error-response-output.schema";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { MapsErrorCode } from "../errors/maps-error-code.enum";
import type { MapsContext } from "./context";

export function createMapsErrorResponse(params: {
	context: Context<MapsContext>;
	errorCode: MapsErrorCode;
	message: string;
	status: ContentfulStatusCode;
	headers?: Record<string, string>;
	violations?: ValidationViolation[];
}): Response {
	const output = MapsErrorResponseOutputSchema.parse({
		errorCode: params.errorCode,
		message: params.message,
		status: params.status,
		requestId: params.context.get("requestId"),
		timestamp: new Date().toISOString(),
		endpoint: params.context.req.path,
		...(params.violations === undefined ? {} : { violations: params.violations }),
	});

	return params.context.json(output, params.status, params.headers);
}
