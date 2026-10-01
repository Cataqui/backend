import { type DescribeRouteOptions, resolver } from "hono-openapi";
import { GeoimageErrorOutputSchema } from "../geoimage-error-output.schema";

const _errorContent = {
	"application/json": { schema: resolver(GeoimageErrorOutputSchema) },
};

export const GetImageDescription = {
	operationId: "getImage",
	tags: ["Images"],
	summary: "Get a geographic image",
	security: [{ geoimagePermission: [] }],
	description:
		"Returns a JPEG basemap in the fixed Cataquí light style: pale land and streets, slate highways, cyan water, and green parks, with native provider labels and attribution. Send the location image.accessToken from a Cataquí API response as Authorization: Bearer. It permits these coordinates without authenticating a user and has no expiration. Worker requests require valid permission before storage or generation; CDN hits are public and bypass verification. Workers Cache serves hits before Worker execution; misses read durable storage and generate if needed. Zoom is fixed at 13 with no overlays. Example: /v1/images?latitude=-23.5505&longitude=-46.6333&size=480x1280&density=2. Size is the logical viewport; density changes pixel resolution, not geographic area. Successful responses allow one day of client caching and one year at the edge; cache retention and client disk caching are not guaranteed. Successful images omit x-request-id. Use a consistent query order and numeric spelling for edge reuse; normalized inputs still share R2 objects.",
	responses: {
		200: {
			description: "Stored or generated JPEG image",
			content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
		},
		400: {
			description:
				"VALIDATION_ERROR with all detected query violations, including duplicate and unknown parameters. Violation messages are developer diagnostics.",
			content: {
				"application/json": {
					schema: resolver(GeoimageErrorOutputSchema),
					examples: {
						invalidFields: {
							value: {
								errorCode: "VALIDATION_ERROR",
								violations: [{ path: ["density"], message: "Density must be 1 or 2." }],
							},
						},
					},
				},
			},
		},
		401: { description: "UNAUTHORIZED: missing or invalid image permission", content: _errorContent },
		403: { description: "FORBIDDEN: permission grants different coordinates", content: _errorContent },
		413: {
			description: "PAYLOAD_TOO_LARGE: body exceeds 4 KiB",
			content: _errorContent,
		},
		405: {
			description: "METHOD_NOT_ALLOWED: use GET or HEAD.",
			content: _errorContent,
		},
		500: {
			description: "INTERNAL_ERROR",
			content: _errorContent,
		},
		502: {
			description: "PROVIDER_UNAVAILABLE",
			content: _errorContent,
		},
		503: {
			description:
				"STORAGE_UNAVAILABLE: durable storage could not be read; AUTH_UNAVAILABLE: verification keys could not be retrieved. Retry later.",
			content: _errorContent,
		},
		504: {
			description: "PROVIDER_TIMEOUT",
			content: _errorContent,
		},
	},
} satisfies DescribeRouteOptions;

export const HeadImageDescription = {
	...GetImageDescription,
	operationId: "headImage",
	summary: "Get geographic image headers",
	description:
		"Returns GET-equivalent image headers without a response body. A cold HEAD may generate and store the image. GET and HEAD share the front-cache entry. Successful image responses omit x-request-id; errors retain request tracing and are not cached.",
	responses: Object.fromEntries(
		Object.entries(GetImageDescription.responses).map(([status, response]) => [
			status,
			{ description: response.description },
		]),
	),
} satisfies DescribeRouteOptions;
