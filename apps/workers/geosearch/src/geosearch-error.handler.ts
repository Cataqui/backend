import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { GeosearchErrorCode } from "./shared/geosearch-error-code.enum";
import type { IGeosearchHonoEnvironment } from "./shared/geosearch-hono-environment.interface";
import { createGeosearchErrorResponse } from "./shared/geosearch-response.utils";
import { GeosearchError } from "./shared/geosearch.error";

export function createGeosearchErrorResponseFromError(params: {
	context: Context<IGeosearchHonoEnvironment>;
	error: Error;
}): Response {
	if (params.error instanceof GeosearchError) {
		return createGeosearchErrorResponse(params.context, {
			errorCode: params.error.errorCode,
			message: params.error.message,
			status: params.error.status,
			...(params.error.headers === undefined ? {} : { headers: params.error.headers }),
		});
	}

	if (params.error instanceof HTTPException && params.error.status === 400) {
		return createGeosearchErrorResponse(params.context, {
			errorCode: GeosearchErrorCode.INVALID_REQUEST,
			message: "The request body is invalid.",
			status: 400,
		});
	}

	console.error({
		event: "geosearch.request.failed",
		method: params.context.req.method,
		path: new URL(params.context.req.url).pathname,
		requestId: params.context.get("requestId"),
		responseStatus: 500,
		errorName: params.error.name,
	});

	return createGeosearchErrorResponse(params.context, {
		errorCode: GeosearchErrorCode.INTERNAL_ERROR,
		message: "An unexpected error occurred.",
		status: 500,
	});
}
