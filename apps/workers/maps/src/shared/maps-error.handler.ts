import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { MapsErrorCode } from "./maps-error-code.enum";
import type { IMapsHonoEnvironment } from "./maps-hono-environment.interface";
import { createMapsErrorResponse } from "./maps-error.response";
import { MapsError } from "./maps.error";

export function createMapsErrorResponseFromError(params: {
	context: Context<IMapsHonoEnvironment>;
	error: Error;
}): Response {
	if (params.error instanceof MapsError) {
		const response = _responses[params.error.errorCode];
		return createMapsErrorResponse({
			context: params.context,
			errorCode:
				params.error.errorCode === MapsErrorCode.PROVIDER_TIMEOUT
					? MapsErrorCode.PROVIDER_UNAVAILABLE
					: params.error.errorCode,
			message: params.error.message || response.message,
			status: response.status,
			...(params.error.errorCode === MapsErrorCode.RATE_LIMITED && params.error.retryAfterMs !== undefined
				? { headers: { "Retry-After": String(Math.ceil(params.error.retryAfterMs / 1_000)) } }
				: {}),
		});
	}

	if (params.error instanceof HTTPException && params.error.status === 400) {
		return createMapsErrorResponse({
			context: params.context,
			errorCode: MapsErrorCode.INVALID_REQUEST,
			message: "The request body is invalid.",
			status: 400,
			violations: [{ path: "body", message: "Expected valid JSON." }],
		});
	}

	console.error({
		event: "maps.request.failed",
		method: params.context.req.method,
		path: new URL(params.context.req.url).pathname,
		requestId: params.context.get("requestId"),
		responseStatus: 500,
		errorName: params.error.name,
	});

	return createMapsErrorResponse({
		context: params.context,
		errorCode: MapsErrorCode.INTERNAL_ERROR,
		message: "An unexpected error occurred.",
		status: 500,
	});
}

const _responses = {
	[MapsErrorCode.PLACE_NOT_FOUND]: { status: 404, message: "The requested place was not found." },
	[MapsErrorCode.IMAGE_NOT_FOUND]: { status: 404, message: "The static image was not found." },
	[MapsErrorCode.STORAGE_UNAVAILABLE]: { status: 503, message: "The stored map is temporarily unavailable." },
	[MapsErrorCode.INTERNAL_ERROR]: { status: 500, message: "An unexpected error occurred." },
	[MapsErrorCode.INVALID_REQUEST]: { status: 400, message: "The request is invalid." },
	[MapsErrorCode.METHOD_NOT_ALLOWED]: { status: 405, message: "The request method is not supported." },
	[MapsErrorCode.PAYLOAD_TOO_LARGE]: { status: 413, message: "The request body is too large." },
	[MapsErrorCode.PROVIDER_UNAVAILABLE]: { status: 502, message: "The map provider is temporarily unavailable." },
	[MapsErrorCode.PROVIDER_TIMEOUT]: { status: 504, message: "The map provider is temporarily unavailable." },
	[MapsErrorCode.TRANSFORMATION_UNAVAILABLE]: { status: 503, message: "The static map could not be prepared." },
	[MapsErrorCode.RATE_LIMITED]: { status: 429, message: "Too many requests. Try again shortly." },
	[MapsErrorCode.ROUTE_NOT_FOUND]: { status: 404, message: "The requested route was not found." },
	[MapsErrorCode.UNAUTHORIZED]: { status: 401, message: "Authentication is required." },
} as const satisfies Record<MapsErrorCode, { status: ContentfulStatusCode; message: string }>;
