import { resolver } from "hono-openapi";
import { MapsErrorResponseOutputSchema } from "./maps-error-response-output.schema";

export const mapsErrorResponse = {
	description:
		"Owned error; developer diagnostics identify invalid fields. Clients localize user-facing copy. All errors use Cache-Control: no-store.",
	content: {
		"application/json": {
			schema: resolver(MapsErrorResponseOutputSchema),
			example: {
				errorCode: "INVALID_REQUEST",
				message: "The request is invalid.",
				status: 400,
				requestId: "request-123",
				timestamp: "2026-10-19T12:00:00.000Z",
				endpoint: "/places/search",
				violations: [
					{ path: ["sessionToken"], message: "Expected a non-empty URL-safe session token of at most 36 characters." },
				],
			},
		},
	},
};
