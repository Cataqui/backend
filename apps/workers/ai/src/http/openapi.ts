import type { GenerateSpecOptions } from "hono-openapi";

export const aiOpenApiOptions = {
	documentation: {
		openapi: "3.1.0",
		info: { title: "Cataquí AI", version: "1.0.0" },
		servers: [{ url: "https://ai.cataqui.com" }, { url: "https://staging.ai.cataqui.com" }],
		components: { securitySchemes: { bearerSession: { type: "http", scheme: "bearer" } } },
		security: [{ bearerSession: [] }],
	},
	defaultValidationErrorResponse: false,
} satisfies Partial<GenerateSpecOptions>;
