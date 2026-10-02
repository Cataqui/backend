import { MapsOpenApiDocument } from "./openapi";
import { createStaticRoutes } from "./modules/static/static.routes";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createPlacesRoutes } from "./modules/places/places.routes";
import { createMapsErrorResponseFromError } from "./shared/maps-error.handler";
import { MapsErrorCode } from "./shared/maps-error-code.enum";
import type { IMapsHonoEnvironment } from "./shared/maps-hono-environment.interface";
import { createMapsErrorResponse } from "./shared/maps-error.response";

const app = new Hono<IMapsHonoEnvironment>();

app.use("*", async (context, next) => {
	const receivedRequestId = context.req.header("x-request-id");

	const requestId =
		receivedRequestId !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(receivedRequestId)
			? receivedRequestId
			: crypto.randomUUID();

	context.set("requestId", requestId);

	await next();
	if (!context.res.headers.has("Cache-Control")) context.res.headers.set("Cache-Control", "no-store");
	context.res.headers.set("x-request-id", requestId);
});

app.use(
	"*",
	bodyLimit({
		maxSize: 4 * 1024,
		onError: (context) =>
			createMapsErrorResponse({
				context: context,
				errorCode: MapsErrorCode.PAYLOAD_TOO_LARGE,
				message: "The request body is too large.",
				status: 413,
			}),
	}),
);

app.get("/openapi.json", (context) => context.json(MapsOpenApiDocument));

app.get("/v1/health", (context) => context.body(null, 204));
app.route("/places", createPlacesRoutes());
app.route("/static", createStaticRoutes());

app.notFound((context) =>
	createMapsErrorResponse({
		context: context,
		errorCode: MapsErrorCode.ROUTE_NOT_FOUND,
		message: "The requested route was not found.",
		status: 404,
	}),
);

app.onError((error, context) => createMapsErrorResponseFromError({ context: context, error: error }));

export default app;

export { MapsEntrypoint } from "./maps-entrypoint";
export { StaticGenerationDurableObject as StaticMapGeneration } from "./modules/static/static-generation.durable-object";
