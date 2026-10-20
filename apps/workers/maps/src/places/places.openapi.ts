import { describeRoute, resolver } from "hono-openapi";
import { mapsErrorResponse } from "../http/error.openapi";
import { PlaceSearchResponseOutputSchema } from "./place-search-response-output.schema";
import { PlaceDetailsResponseOutputSchema } from "./place-details-response-output.schema";

export const searchPlacesDocs = describeRoute({
	summary: "Search place suggestions",
	description:
		"Preserves provider session grouping and localized labels. Send the same sessionToken for search and selected-place details. Blank queries return an empty list without a provider call. Subject to a per-account limit of 30 requests per 60 seconds; responses are no-store.",
	security: [{ mapsBearer: [] }],
	responses: {
		default: mapsErrorResponse,
		"405": {
			...mapsErrorResponse,
			description: "Use QUERY with a JSON request body.",
			headers: { Allow: { schema: { type: "string", enum: ["QUERY"] } } },
		},
		"429": {
			...mapsErrorResponse,
			description: "Per-account limit of 30 requests per 60 seconds reached. Wait before retrying.",
		},
		"200": {
			description: "Ordered suggestions and required attribution.",
			content: { "application/json": { schema: resolver(PlaceSearchResponseOutputSchema) } },
		},
	},
});

export const getPlaceDetailsDocs = describeRoute({
	summary: "Resolve selected place coordinates",
	description:
		"Uses the search sessionToken with the selected placeId. Subject to a per-account limit of 10 requests per 60 seconds; responses are no-store.",
	security: [{ mapsBearer: [] }],

	responses: {
		default: mapsErrorResponse,
		"405": {
			...mapsErrorResponse,
			description: "Use QUERY with a JSON request body.",
			headers: { Allow: { schema: { type: "string", enum: ["QUERY"] } } },
		},
		"429": {
			...mapsErrorResponse,
			description: "Per-account limit of 10 requests per 60 seconds reached. Wait before retrying.",
		},
		"200": {
			description: "Coordinates for the selected place.",
			content: { "application/json": { schema: resolver(PlaceDetailsResponseOutputSchema) } },
		},
	},
});
