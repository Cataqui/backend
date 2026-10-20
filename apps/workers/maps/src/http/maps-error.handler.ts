import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import type { MapsContext } from "./context";
import { createMapsErrorResponse } from "./maps-error.response";
import { AppError } from "../errors/app.error";
import { PlaceSearchRateLimitedError } from "../places/errors/place-search-rate-limited.error";
import { PlaceDetailsRateLimitedError } from "../places/errors/place-details-rate-limited.error";

export function createMapsErrorResponseFromError(params: { context: Context<MapsContext>; error: Error }): Response {
	const error = params.error;
	if (error instanceof AppError) {
		const rateLimited = error instanceof PlaceSearchRateLimitedError || error instanceof PlaceDetailsRateLimitedError;
		return createMapsErrorResponse({
			context: params.context,
			errorCode:
				error.errorCode === MapsErrorCode.PROVIDER_TIMEOUT ? MapsErrorCode.PROVIDER_UNAVAILABLE : error.errorCode,
			message: error.message,
			status: error.status,
			...(rateLimited ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1_000)) } } : {}),
		});
	}

	if (error instanceof HTTPException && error.status === 400) {
		return createMapsErrorResponse({
			context: params.context,
			errorCode: MapsErrorCode.INVALID_REQUEST,
			message: "The request body is invalid.",
			status: 400,
			violations: [{ path: ["body"], message: "Expected valid JSON." }],
		});
	}

	console.error({
		event: "maps.request.failed",
		method: params.context.req.method,
		path: routePath(params.context),
		requestId: params.context.get("requestId"),
		responseStatus: 500,
		errorName: error.name,
	});

	return createMapsErrorResponse({
		context: params.context,
		errorCode: MapsErrorCode.INTERNAL_ERROR,
		message: "An unexpected error occurred.",
		status: 500,
	});
}
