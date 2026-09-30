import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { developmentDocumentationOnly } from "./documentation/development-documentation.middleware";
import { GeovisualErrorCode } from "./geovisual-error-code.enum";
import { createGeovisualErrorResponse } from "./geovisual-error-response";
import type { IGeovisualHonoEnvironment } from "./geovisual-hono-environment.interface";
import { GeovisualError } from "./geovisual.error";
import { createLocationsRoutes } from "./locations/locations.routes";

const app = new Hono<IGeovisualHonoEnvironment>();

app.use("*", async (context, next) => {
	const receivedRequestId = context.req.header("x-request-id");

	const requestId =
		receivedRequestId !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(receivedRequestId)
			? receivedRequestId
			: crypto.randomUUID();

	context.set("requestId", requestId);
	await next();
	context.header("Cache-Control", "no-store");
	context.header("x-request-id", requestId);
});

app.use(
	"*",
	bodyLimit({
		maxSize: 4 * 1024,
		onError: (context) =>
			createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.PAYLOAD_TOO_LARGE }),
	}),
);

app.get(
	"/v1/health",
	describeRoute({
		operationId: "checkHealth",
		tags: ["Health"],
		summary: "Check Worker health",
		responses: { 204: { description: "Worker is healthy; no response body" } },
	}),
	(context) => context.body(null, 204),
);

app.all("/v1/health", (context) => {
	context.header("Allow", "GET, HEAD");
	return createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.METHOD_NOT_ALLOWED });
});

app.route("/v1/locations", createLocationsRoutes());
app.use("/docs", developmentDocumentationOnly);
app.use("/openapi.json", developmentDocumentationOnly);
app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get(
	"/openapi.json",
	openAPIRouteHandler(app, {
		documentation: {
			info: {
				title: "Geovisual",
				version: "1.0.0",
				description:
					"Independent geographic image generation. Responses include Cache-Control: no-store and x-request-id.",
			},
		},
		defaultValidationErrorResponse: false,
	}),
);
app.notFound((context) =>
	createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.ROUTE_NOT_FOUND }),
);
app.onError((error, context) => {
	if (error instanceof GeovisualError) {
		return createGeovisualErrorResponse({ context: context, errorCode: error.errorCode });
	}
	if (error instanceof HTTPException && error.status === 400) {
		return createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.INVALID_REQUEST });
	}
	console.error({ event: "geovisual.request.failed", requestId: context.get("requestId"), responseStatus: 500 });
	return createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.INTERNAL_ERROR });
});
export default app;
