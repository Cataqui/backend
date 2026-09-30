import { type DescribeRouteOptions, resolver } from "hono-openapi";
import { GeovisualErrorOutputSchema } from "../geovisual-error-output.schema";

const _errorContent = {
	"application/json": { schema: resolver(GeovisualErrorOutputSchema) },
};

export const GenerateLocationDescription = {
	operationId: "generateLocation",
	tags: ["Locations"],
	summary: "Generate a visual representation of a location",
	description: "Returns a plain basemap native provider labels.",
	responses: {
		200: {
			description: "Generated JPEG image",
			content: { "image/jpeg": { schema: { type: "string", format: "binary" } } },
		},
		400: {
			description:
				"INVALID_REQUEST for malformed JSON or unsupported content types; VALIDATION_ERROR with all detected field violations for invalid JSON input. Violation messages are developer diagnostics.",
			content: {
				"application/json": {
					schema: resolver(GeovisualErrorOutputSchema),
					examples: {
						malformedRequest: { value: { errorCode: "INVALID_REQUEST" } },
						invalidFields: {
							value: {
								errorCode: "VALIDATION_ERROR",
								violations: [{ path: ["map", "density"], message: "Density must be 1 or 2." }],
							},
						},
					},
				},
			},
		},
		413: {
			description: "PAYLOAD_TOO_LARGE: body exceeds 4 KiB",
			content: _errorContent,
		},
		405: {
			description: "METHOD_NOT_ALLOWED: use POST",
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
		504: {
			description: "PROVIDER_TIMEOUT",
			content: _errorContent,
		},
	},
} satisfies DescribeRouteOptions;
