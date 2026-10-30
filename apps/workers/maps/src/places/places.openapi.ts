import type { z } from "zod";
import { PlaceCategory } from "@cataqui/places";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { MapsErrorResponseOutputSchema } from "../http/maps-error-response-output.schema";
import { PlaceSearchInputSchema } from "./place-search-input.schema";
import { PlaceDetailsInputSchema } from "./place-details-input.schema";
import { describeRoute, resolver } from "hono-openapi";
import { mapsErrorResponse, mapsInternalErrorExample } from "../http/error.openapi";
import { PlaceSearchResponseOutputSchema } from "./place-search-response-output.schema";
import { PlaceDetailsResponseOutputSchema } from "./place-details-response-output.schema";

export const searchPlacesDocs = describeRoute({
	summary: "Search place suggestions",
	description:
		"Preserves provider session grouping and localized labels. Send the same sessionToken for search and selected-place details. Blank queries return an empty list without a provider call. Subject to a per-account limit of 30 requests per 60 seconds; responses are no-store.",
	security: [{ mapsBearer: [] }],
	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(PlaceSearchInputSchema, { options: { io: "input" } }),
				example: { query: "Osasco", sessionToken: "example-session" } satisfies z.input<typeof PlaceSearchInputSchema>,
			},
		},
	},
	responses: {
		default: {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: { ...mapsInternalErrorExample, endpoint: "/places/search" } satisfies z.output<
						typeof MapsErrorResponseOutputSchema
					>,
				},
			},
		},
		"405": {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: {
						...mapsInternalErrorExample,
						status: 405,
						errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
						message: "This route requires the QUERY method.",
						endpoint: "/places/search",
					} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
				},
			},
			description: "Use QUERY with a JSON request body.",
			headers: { Allow: { schema: { type: "string", enum: ["QUERY"] } } },
		},
		"429": {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: {
						...mapsInternalErrorExample,
						status: 429,
						errorCode: MapsErrorCode.RATE_LIMITED,
						message: "Too many place searches. Try again shortly.",
						endpoint: "/places/search",
					} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
				},
			},
			description: "Per-account limit of 30 requests per 60 seconds reached. Wait before retrying.",
		},
		"200": {
			description: "Ordered suggestions and required attribution.",
			content: {
				"application/json": {
					schema: resolver(PlaceSearchResponseOutputSchema),
					examples: {
						populated: {
							summary: "Matching places",
							value: {
								data: {
									suggestions: [
										{
											placeId: "example-place-id",
											fullText: "Centro, Osasco, SP, Brasil",
											primaryText: "Centro",
											secondaryText: "Osasco, SP, Brasil",
											category: PlaceCategory.NEIGHBORHOOD,
										},
									],
									attribution: { text: "Google Maps" },
								},
								requestId: "example-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/places/search",
							} satisfies z.output<typeof PlaceSearchResponseOutputSchema>,
						},
						empty: {
							summary: "No matching places",
							value: {
								data: { suggestions: [], attribution: { text: "Google Maps" } },
								requestId: "example-request",
								timestamp: "2026-10-30T12:00:00.000Z",
								endpoint: "/places/search",
							} satisfies z.output<typeof PlaceSearchResponseOutputSchema>,
						},
					},
				},
			},
		},
	},
});

export const getPlaceDetailsDocs = describeRoute({
	summary: "Resolve selected place coordinates",
	description:
		"Uses the search sessionToken with the selected placeId. Subject to a per-account limit of 10 requests per 60 seconds; responses are no-store.",
	security: [{ mapsBearer: [] }],

	requestBody: {
		required: true,
		content: {
			"application/json": {
				schema: resolver(PlaceDetailsInputSchema, { options: { io: "input" } }),
				example: { placeId: "example-place-id", sessionToken: "example-session" } satisfies z.input<
					typeof PlaceDetailsInputSchema
				>,
			},
		},
	},
	responses: {
		default: {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: { ...mapsInternalErrorExample, endpoint: "/places/details" } satisfies z.output<
						typeof MapsErrorResponseOutputSchema
					>,
				},
			},
		},
		"405": {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: {
						...mapsInternalErrorExample,
						status: 405,
						errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
						message: "This route requires the QUERY method.",
						endpoint: "/places/details",
					} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
				},
			},
			description: "Use QUERY with a JSON request body.",
			headers: { Allow: { schema: { type: "string", enum: ["QUERY"] } } },
		},
		"429": {
			...mapsErrorResponse,
			content: {
				"application/json": {
					...mapsErrorResponse.content["application/json"],
					example: {
						...mapsInternalErrorExample,
						status: 429,
						errorCode: MapsErrorCode.RATE_LIMITED,
						message: "Too many place detail requests. Try again shortly.",
						endpoint: "/places/details",
					} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
				},
			},
			description: "Per-account limit of 10 requests per 60 seconds reached. Wait before retrying.",
		},
		"200": {
			description: "Coordinates for the selected place.",
			content: {
				"application/json": {
					schema: resolver(PlaceDetailsResponseOutputSchema),
					example: {
						data: { latitude: -23.5325, longitude: -46.7917 },
						requestId: "example-request",
						timestamp: "2026-10-30T12:00:00.000Z",
						endpoint: "/places/details",
					} satisfies z.output<typeof PlaceDetailsResponseOutputSchema>,
				},
			},
		},
	},
});
