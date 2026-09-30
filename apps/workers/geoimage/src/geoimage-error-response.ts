import type { Context } from "hono";
import type { z } from "zod";
import { GeoimageErrorCode } from "./geoimage-error-code.enum";
import { GeoimageErrorOutputSchema } from "./geoimage-error-output.schema";
import type { IGeoimageHonoEnvironment } from "./geoimage-hono-environment.interface";

const _statuses = {
	[GeoimageErrorCode.INVALID_REQUEST]: 400,
	[GeoimageErrorCode.VALIDATION_ERROR]: 400,
	[GeoimageErrorCode.PAYLOAD_TOO_LARGE]: 413,
	[GeoimageErrorCode.METHOD_NOT_ALLOWED]: 405,
	[GeoimageErrorCode.ROUTE_NOT_FOUND]: 404,
	[GeoimageErrorCode.PROVIDER_UNAVAILABLE]: 502,
	[GeoimageErrorCode.PROVIDER_TIMEOUT]: 504,
	[GeoimageErrorCode.STORAGE_UNAVAILABLE]: 503,
	[GeoimageErrorCode.INTERNAL_ERROR]: 500,
} as const;

export function createGeoimageErrorResponse(
	params: {
		context: Context<IGeoimageHonoEnvironment>;
	} & z.input<typeof GeoimageErrorOutputSchema>,
): Response {
	const { context, ...output } = params;
	return context.json(GeoimageErrorOutputSchema.parse(output), _statuses[output.errorCode]);
}
