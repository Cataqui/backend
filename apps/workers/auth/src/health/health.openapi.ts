import { authErrorResponse } from "../http/error.openapi";
import { describeRoute } from "hono-openapi";

export const checkReadinessDocs = describeRoute({
	operationId: "checkReadiness",
	security: [],
	responses: {
		default: authErrorResponse,
		"503": {
			...authErrorResponse,
			description: "Database or Redis is unavailable. The Worker is not ready to serve requests.",
		},
		"200": { description: "Database and Redis available" },
	},
});

export const checkLivenessDocs = describeRoute({
	operationId: "checkLiveness",
	security: [],
	responses: { "204": { description: "Worker available" }, default: authErrorResponse },
});
