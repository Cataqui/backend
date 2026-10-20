import type { GenerateSpecOptions } from "hono-openapi";

export const authOpenApiOptions = {
	documentation: {
		openapi: "3.1.0",
		info: { title: "Cataquí Auth", version: "1.0.0" },
		servers: [{ url: "https://auth.cataqui.com" }, { url: "https://staging.auth.cataqui.com" }],
		components: { securitySchemes: { bearerSession: { type: "http", scheme: "bearer" } } },
		security: [{ bearerSession: [] }],
	},
	defaultValidationErrorResponse: false,
} satisfies Partial<GenerateSpecOptions>;
