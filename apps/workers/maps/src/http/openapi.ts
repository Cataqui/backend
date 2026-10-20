import type { GenerateSpecOptions } from "hono-openapi";
export const mapsOpenApiOptions = {
	documentation: {
		openapi: "3.2.0",
		info: {
			title: "Cataquí Maps",
			version: "1.0.0",
			description:
				"Place lookup and server-rendered map images from reusable stored geographic data. Private map reference preparation uses Worker RPC and has no public coordinate-based generation endpoint. Place operations use the same opaque access token issued by Cataquí Auth. Authentication is resolved through a private Service Binding; unavailable Auth returns 503.",
		},
		components: {
			securitySchemes: {
				mapsBearer: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "opaque",
					description:
						"Opaque account access token issued by Cataquí Auth. Never use provider keys as client credentials.",
				},
			},
		},
	},
	defaultValidationErrorResponse: false,
} satisfies Partial<GenerateSpecOptions>;
