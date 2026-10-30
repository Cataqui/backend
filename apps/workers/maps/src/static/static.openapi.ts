import type { z } from "zod";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { MapsErrorResponseOutputSchema } from "../http/maps-error-response-output.schema";
import { describeRoute, type DescribeRouteOptions } from "hono-openapi";
import { mapsErrorResponse, mapsInternalErrorExample } from "../http/error.openapi";
const _staticHeaders = {
	"Cache-Control": {
		description:
			"Public responses are fresh for one year. Cloudflare may serve a cached image for one additional year if refreshing it fails. Cache retention and stale delivery are best-effort; evicted entries must be rendered again. Images are not declared immutable.",
		schema: { type: "string" },
	},
	ETag: {
		description: "Weak representation entity tag derived from the rendered image digest.",
		schema: { type: "string" },
	},
	"X-Content-Type-Options": { description: "nosniff", schema: { type: "string" } },
} as const;
const _staticResponses = {
	default: {
		...mapsErrorResponse,
		content: {
			"application/json": {
				...mapsErrorResponse.content["application/json"],
				example: { ...mapsInternalErrorExample, endpoint: "/static/v1/example.webp" } satisfies z.output<
					typeof MapsErrorResponseOutputSchema
				>,
			},
		},
	},
	"404": {
		...mapsErrorResponse,
		content: {
			"application/json": {
				...mapsErrorResponse.content["application/json"],
				example: {
					...mapsInternalErrorExample,
					status: 404,
					errorCode: MapsErrorCode.IMAGE_NOT_FOUND,
					message: "The static image was not found.",
					endpoint: "/static/v1/example.webp",
				} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
			},
		},
		description: "Signed image reference is invalid or belongs to another environment. Obtain a new image URL.",
	},
	"200": {
		description:
			"WebP image composed on the server. The mobile client displays image bytes and renders no vector map. HEAD returns the same metadata without a body. Responses have no declared Content-Length or Last-Modified.",
		headers: _staticHeaders,
		content: { "image/webp": { schema: { type: "string", contentMediaType: "image/webp" } } },
	},
	"304": { description: "The available representation matches If-None-Match; no body.", headers: _staticHeaders },
	"405": {
		...mapsErrorResponse,
		content: {
			"application/json": {
				...mapsErrorResponse.content["application/json"],
				example: {
					...mapsInternalErrorExample,
					status: 405,
					errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
					message: "Static images support GET and HEAD requests.",
					endpoint: "/static/v1/example.webp",
				} satisfies z.output<typeof MapsErrorResponseOutputSchema>,
			},
		},
		description: "Use GET for the image or HEAD for its response metadata.",
		headers: { Allow: { schema: { type: "string", enum: ["GET, HEAD"] } } },
	},
} satisfies NonNullable<DescribeRouteOptions["responses"]>;
const _staticImageDocumentation = {
	summary: "Retrieve a static map",
	security: [],
	parameters: [
		{
			name: "If-None-Match",
			in: "header",
			description:
				"GET and HEAD use weak comparison, including strong tags with the same opaque value, comma-separated entity tags, or *. A matching available representation returns 304 without a body. Cloudflare owns conditional delivery and stale fallback for cached responses. If-Modified-Since is ignored because this endpoint does not provide Last-Modified.",
			schema: { type: "string" },
		},
	],
	responses: _staticResponses,
} satisfies DescribeRouteOptions;

export const getStaticImageDocs = describeRoute(_staticImageDocumentation);
export const headStaticImageDocs = describeRoute({
	..._staticImageDocumentation,
	summary: "Retrieve static-map response metadata",
	responses: {
		..._staticResponses,
		"200": { description: "Map response headers without a body.", headers: _staticHeaders },
	},
});
