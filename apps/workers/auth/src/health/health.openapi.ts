import type { z } from "zod";
import { resolver } from "hono-openapi";
import { AppErrorCode } from "../errors/app-error-code.enum";
import { AuthErrorResponseOutputSchema } from "../http/auth-error-response-output.schema";
import { HealthOutputSchema } from "./health-output.schema";
import { authErrorResponse, authInternalErrorExample } from "../http/error.openapi";
import { describeRoute } from "hono-openapi";

export const checkReadinessDocs = describeRoute({
	operationId: "checkReadiness",
	security: [],
	responses: {
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/health" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
		"503": {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: {
						...authInternalErrorExample,
						errorCode: AppErrorCode.AUTH_NOT_READY,
						status: 503,
						message: "An authentication dependency is unavailable.",
						endpoint: "/v1/health",
					} satisfies z.output<typeof AuthErrorResponseOutputSchema>,
				},
			},
			description: "Database or Redis is unavailable. The Worker is not ready to serve requests.",
		},
		"200": {
			description: "Database and Redis available",
			content: {
				"application/json": {
					schema: resolver(HealthOutputSchema),
					example: { status: "ok" } satisfies z.output<typeof HealthOutputSchema>,
				},
			},
		},
	},
});

export const checkLivenessDocs = describeRoute({
	operationId: "checkLiveness",
	security: [],
	responses: {
		"204": { description: "Worker available" },
		default: {
			...authErrorResponse,
			content: {
				"application/json": {
					...authErrorResponse.content["application/json"],
					example: { ...authInternalErrorExample, endpoint: "/v1/health/live" } satisfies z.output<
						typeof AuthErrorResponseOutputSchema
					>,
				},
			},
		},
	},
});
