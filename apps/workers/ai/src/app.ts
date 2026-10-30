import "reflect-metadata";
import { tsyringe } from "@hono/tsyringe";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { aiOpenApiOptions } from "./http/openapi";
import { requestId } from "hono/request-id";
import type { DependencyContainer } from "tsyringe";
import { registerDependencies } from "#ai/dependencies";
import { RateLimitConfig } from "#ai/inference/rate-limit.config";
import { AppError } from "#ai/errors/app.error";
import { InvalidInputError } from "#ai/errors/invalid-input.error";
import { NameAnalysisLimitError } from "#ai/inference/errors/name-analysis-limit.error";
import { inferenceRoutes } from "#ai/inference/inference.routes";
import { healthRoutes } from "#ai/health/health.routes";
import { AiErrorResponseOutputSchema } from "#ai/http/ai-error-response-output.schema";
import type { AiContext } from "#ai/http/context";
import { InternalError } from "#ai/http/errors/internal.error";
import { RouteNotFoundError } from "#ai/http/errors/route-not-found.error";

const app = new Hono<AiContext>();

app.use("*", requestId());
app.use("*", async (context, next) => {
	context.header("Cache-Control", "no-store");
	await next();
});

app.use("*", async (context, next) => {
	let scope: DependencyContainer | undefined;
	try {
		await tsyringe((childContainer) => {
			scope = childContainer;
			registerDependencies({ container: childContainer, environment: context.env });
		})(context, next);
	} finally {
		await scope?.dispose();
	}
});

app.route("/v1/health", healthRoutes);
app.route("/v1/inference", inferenceRoutes);
app.get(
	"/openapi.json",
	(context, next) => {
		if (context.env?.ENVIRONMENT !== "development") throw new RouteNotFoundError();
		return next();
	},
	openAPIRouteHandler(app, aiOpenApiOptions),
);

app.notFound(() => {
	throw new RouteNotFoundError();
});

app.onError((error, context) => {
	const presentedError = error instanceof AppError ? error : new InternalError();
	if (presentedError instanceof NameAnalysisLimitError) {
		context.header("Retry-After", String(RateLimitConfig.nameAnalysis.period));
	}
	if (presentedError.status === 500) {
		console.error({
			event: "ai.request.failed",
			method: context.req.method,
			requestId: context.get("requestId"),
			responseStatus: presentedError.status,
			errorCode: presentedError.errorCode,
		});
	}

	return context.json(
		AiErrorResponseOutputSchema.parse({
			errorCode: presentedError.errorCode,
			message: presentedError.message,
			status: presentedError.status,
			requestId: context.get("requestId"),
			timestamp: new Date().toISOString(),
			endpoint: context.req.path,
			...(presentedError instanceof InvalidInputError ? { violations: presentedError.violations } : {}),
		}),
		presentedError.status,
	);
});

export default app;
