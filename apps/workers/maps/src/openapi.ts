import { z } from "zod";
import { PlaceSearchInputSchema } from "./modules/places/schemas/place-search-input.schema";
import { PlaceDetailsInputSchema } from "./modules/places/schemas/place-details-input.schema";
import { PlaceSearchOutputSchema } from "./modules/places/schemas/place-search-output.schema";
import { PlaceDetailsOutputSchema } from "./modules/places/schemas/place-details-output.schema";
import { MapsErrorOutputSchema } from "./shared/maps-error-output.schema";
import { StaticVariantInputSchema } from "./modules/static/schemas/static-variant-input.schema";
import { StaticInputSchema } from "./modules/static/schemas/static-input.schema";

const _errorResponse = {
	description:
		"Owned error; developer diagnostics identify invalid fields. Clients localize user-facing copy. All errors use Cache-Control: no-store.",
	content: {
		"application/json": {
			schema: z.toJSONSchema(MapsErrorOutputSchema),
			example: {
				errorCode: "INVALID_REQUEST",
				message: "The request is invalid.",
				violations: [
					{ path: "sessionToken", message: "Expected a non-empty URL-safe session token of at most 36 characters." },
				],
			},
		},
	},
};
const _placeParameters = [
	{
		name: "Accept-Language",
		in: "header",
		required: true,
		description:
			"Required language tag used to localize place search results. Accept-Language preference lists use their first language tag. Missing, blank, or invalid primary tags return INVALID_REQUEST with a headers.Accept-Language violation.",
		schema: { type: "string" },
		example: "pt-BR",
	},
];
const _staticHeaders = {
	"Cache-Control": { description: "public, max-age=31536000, immutable", schema: { type: "string" } },
	ETag: { description: "Opaque R2 entity tag for conditional requests.", schema: { type: "string" } },
	"Last-Modified": { description: "HTTP date of the stored object.", schema: { type: "string" } },
};
const _staticResponses = {
	"200": {
		description:
			"Stored WebP bytes. No generation or authentication occurs. HEAD returns these headers without a body.",
		headers: _staticHeaders,
		content: { "image/webp": { schema: { type: "string", contentMediaType: "image/webp" } } },
	},
	"304": { description: "Stored representation is unchanged; no body.", headers: _staticHeaders },
	"400": _errorResponse,
	"404": _errorResponse,
	"405": _errorResponse,
	"503": _errorResponse,
};

export const MapsOpenApiDocument = {
	openapi: "3.2.0",
	info: {
		title: "Cataquí Maps",
		version: "1.0.0",
		description:
			"Place lookup and immutable stored-map delivery. Private map preparation uses Worker RPC and has no public HTTP endpoint. API issues Maps tokens at POST /v1/auth/microservices/maps.",
	},
	components: {
		securitySchemes: {
			mapsBearer: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
				description:
					"Short-lived user token with MAPS audience, issued by the API. Never use provider keys as client credentials.",
			},
		},
	},
	paths: {
		"/places/search": {
			query: {
				summary: "Search place suggestions",
				description:
					"Preserves provider session grouping and localized labels. Send the same sessionToken for search and selected-place details. Blank queries return an empty list without a provider call. Subject to a per-user limit of 30 requests per 60 seconds; responses are no-store.",
				security: [{ mapsBearer: [] }],
				parameters: _placeParameters,
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: z.toJSONSchema(PlaceSearchInputSchema, { io: "input" }),
							example: { query: "Osasco", sessionToken: "session-123" },
						},
					},
				},
				responses: {
					"200": {
						description: "Ordered suggestions and required attribution.",
						content: { "application/json": { schema: z.toJSONSchema(PlaceSearchOutputSchema) } },
					},
					"400": _errorResponse,
					"401": _errorResponse,
					"413": _errorResponse,
					"429": _errorResponse,
					"502": _errorResponse,
					"503": _errorResponse,
					"504": _errorResponse,
				},
			},
		},
		"/places/details": {
			query: {
				summary: "Resolve selected place coordinates",
				description:
					"Uses the search sessionToken with the selected placeId. Subject to a per-user limit of 10 requests per 60 seconds; responses are no-store.",
				security: [{ mapsBearer: [] }],

				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: z.toJSONSchema(PlaceDetailsInputSchema, { io: "input" }),
							example: { placeId: "selected-provider-place-id", sessionToken: "session-123" },
						},
					},
				},
				responses: {
					"200": {
						description: "Coordinates for the selected place.",
						content: { "application/json": { schema: z.toJSONSchema(PlaceDetailsOutputSchema) } },
					},
					"400": _errorResponse,
					"401": _errorResponse,
					"413": _errorResponse,
					"429": _errorResponse,
					"502": _errorResponse,
					"503": _errorResponse,
					"504": _errorResponse,
				},
			},
		},
		"/static/{id}": {
			parameters: [
				{
					name: "size",
					in: "query",
					required: true,
					description:
						"Logical dimensions: 480x480 or 480x1280. Unavailable variants return 404; reads never generate images.",
					schema: z.toJSONSchema(StaticVariantInputSchema.shape.size, { io: "input" }),
				},
				{
					name: "scale",
					in: "query",
					description: "Pixel scale; only 2 is prepared. Defaults to 2.",
					schema: z.toJSONSchema(StaticVariantInputSchema.shape.scale, { io: "input" }),
				},
				{
					name: "zoom",
					in: "query",
					description: "Only zoom 13 is prepared. Defaults to 13.",
					schema: z.toJSONSchema(StaticVariantInputSchema.shape.zoom, { io: "input" }),
				},
				{ name: "id", in: "path", required: true, schema: z.toJSONSchema(StaticInputSchema.shape.id) },
				{
					name: "If-None-Match",
					in: "header",
					description: "Takes precedence over If-Modified-Since.",
					schema: { type: "string" },
				},
				{
					name: "If-Modified-Since",
					in: "header",
					description: "HTTP date; ignored if invalid.",
					schema: { type: "string" },
				},
			],
			get: { summary: "Read an existing static map", security: [], responses: _staticResponses },
			head: {
				summary: "Read existing static-map metadata",
				security: [],
				responses: {
					..._staticResponses,
					"200": {
						description: "Stored representation headers, with Content-Length and no body.",
						headers: _staticHeaders,
					},
				},
			},
		},
		"/v1/health": {
			get: {
				summary: "Check Worker health",
				security: [],
				responses: { "204": { description: "Healthy; Cache-Control: no-store." } },
			},
		},
	},
};
