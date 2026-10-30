import type { z } from "zod";
import { resolver } from "hono-openapi";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { MapsErrorResponseOutputSchema } from "./maps-error-response-output.schema";

export const mapsErrorResponse = {
	description:
		"Owned error; developer diagnostics identify invalid fields. Clients localize user-facing copy. All errors use Cache-Control: no-store.",
	content: { "application/json": { schema: resolver(MapsErrorResponseOutputSchema) } },
};

export const mapsInternalErrorExample = {
	errorCode: MapsErrorCode.INTERNAL_ERROR,
	message: "An unexpected error occurred.",
	status: 500,
	requestId: "example-request",
	timestamp: "2026-10-30T12:00:00.000Z",
	endpoint: "/places/search",
} satisfies z.output<typeof MapsErrorResponseOutputSchema>;
