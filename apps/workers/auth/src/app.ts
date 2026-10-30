import "reflect-metadata";
import { accountRoutes } from "#auth/account/account.routes";
import { registerAuthDependencies } from "#auth/auth-dependencies";
import { AppError } from "#auth/errors/app.error";
import { healthRoutes } from "#auth/health/health.routes";
import type { AuthContext } from "#auth/http/context";
import { InternalError } from "#auth/http/errors/internal.error";
import { InvalidRequestError } from "#auth/http/errors/invalid-request.error";
import { PayloadTooLargeError } from "#auth/http/errors/payload-too-large.error";
import { RequestValidationError } from "#auth/http/errors/request-validation.error";
import { RouteNotFoundError } from "#auth/http/errors/route-not-found.error";
import { authOpenApiOptions } from "#auth/http/openapi";
import { notpRoutes } from "#auth/notp/notp.routes";
import { sessionRoutes } from "#auth/session/session.routes";
import { scheduled } from "#auth/scheduled";
import { whatsappRoutes } from "#auth/whatsapp/whatsapp.routes";
import { AuthErrorResponseOutputSchema } from "./http/auth-error-response-output.schema";
import { tsyringe } from "@hono/tsyringe";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { openAPIRouteHandler } from "hono-openapi";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { DependencyContainer } from "tsyringe";
import type { AuthWorkerEnv } from "../cloudflare.config.ts";

const app = new Hono<AuthContext>();

app.use("*", requestId());
app.use("*", cors());
app.use("*", async (context, next) => {
	await next();
	context.header("Cache-Control", "no-store");
});
app.use(
	"/v1/*",
	bodyLimit({
		maxSize: 64 * 1024,
		onError: () => {
			throw new PayloadTooLargeError();
		},
	}),
);

app.use("*", async (context, next) => {
	let scope: DependencyContainer | undefined;
	try {
		await tsyringe((childContainer) => {
			scope = childContainer;
			registerAuthDependencies({ container: childContainer, environment: context.env });
		})(context, next);
	} finally {
		await scope?.dispose();
	}
});

app.route("/v1/account", accountRoutes);
app.route("/v1/sessions", sessionRoutes);
app.route("/v1/notp", notpRoutes);
app.route("/v1/health", healthRoutes);
app.route("/webhooks/whatsapp", whatsappRoutes);
app.get(
	"/openapi.json",
	(context, next) => {
		if (context.env?.ENVIRONMENT !== "development") throw new RouteNotFoundError();
		return next();
	},
	openAPIRouteHandler(app, authOpenApiOptions),
);
app.notFound(() => {
	throw new RouteNotFoundError();
});

app.onError((error, context) => {
	const invalidJsonBody = error instanceof HTTPException && error.status === 400;
	if (invalidJsonBody) error = new InvalidRequestError();
	const presentedError = error instanceof AppError ? error : new InternalError();
	const status = presentedError.status;

	if (status === 500)
		console.error({
			event: "auth.request.failed",
			method: context.req.method,
			path: context.req.path,
			responseStatus: status,
			errorCode: presentedError.errorCode,
		});

	return context.json(
		AuthErrorResponseOutputSchema.parse({
			errorCode: presentedError.errorCode,
			message: presentedError.message,
			status: status,
			requestId: context.get("requestId"),
			timestamp: new Date().toISOString(),
			endpoint: context.req.path,
			...(presentedError instanceof RequestValidationError ? { violations: presentedError.violations } : {}),
		}),
		status,
	);
});

export { AuthEntrypoint } from "#auth/entrypoint";

export default {
	fetch: app.fetch,
	scheduled: scheduled,
} satisfies ExportedHandler<AuthWorkerEnv>;
export { app };
