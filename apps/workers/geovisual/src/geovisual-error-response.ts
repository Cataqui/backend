import type { Context } from "hono";
import type { z } from "zod";
import { GeovisualErrorCode } from "./geovisual-error-code.enum";
import { GeovisualErrorOutputSchema } from "./geovisual-error-output.schema";
import type { IGeovisualHonoEnvironment } from "./geovisual-hono-environment.interface";

const _statuses = {
	[GeovisualErrorCode.INVALID_REQUEST]: 400,
	[GeovisualErrorCode.VALIDATION_ERROR]: 400,
	[GeovisualErrorCode.PAYLOAD_TOO_LARGE]: 413,
	[GeovisualErrorCode.METHOD_NOT_ALLOWED]: 405,
	[GeovisualErrorCode.ROUTE_NOT_FOUND]: 404,
	[GeovisualErrorCode.PROVIDER_UNAVAILABLE]: 502,
	[GeovisualErrorCode.PROVIDER_TIMEOUT]: 504,
	[GeovisualErrorCode.INTERNAL_ERROR]: 500,
} as const;

export function createGeovisualErrorResponse(
	params: {
		context: Context<IGeovisualHonoEnvironment>;
	} & z.input<typeof GeovisualErrorOutputSchema>,
): Response {
	const { context, ...output } = params;
	return context.json(GeovisualErrorOutputSchema.parse(output), _statuses[output.errorCode]);
}
