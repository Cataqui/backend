import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { developmentDocumentationOnly } from "./documentation/development-documentation.middleware";
import { GeoimageErrorCode } from "./geoimage-error-code.enum";
import { createGeoimageErrorResponse } from "./geoimage-error-response";
import type { IGeoimageHonoEnvironment } from "./geoimage-hono-environment.interface";
import { GeoimageError } from "./geoimage.error";
import { createImagesRoutes } from "./images/images.routes";

const app = new Hono<IGeoimageHonoEnvironment>();

app.use("*", async (context, next) => {
	const receivedRequestId = context.req.header("x-request-id");

	const requestId =
		receivedRequestId !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(receivedRequestId)
			? receivedRequestId
			: crypto.randomUUID();

	context.set("requestId", requestId);
	await next();
	if (!context.res.headers.has("Cache-Control")) context.header("Cache-Control", "no-store");
	if (context.res.headers.get("Cache-Control") === "no-store") context.header("x-request-id", requestId);
});

app.use(
	"*",
	bodyLimit({
		maxSize: 4 * 1024,
		onError: (context) =>
			createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.PAYLOAD_TOO_LARGE }),
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
	return createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.METHOD_NOT_ALLOWED });
});

app.route("/v1/images", createImagesRoutes());
app.use("/docs", developmentDocumentationOnly);
app.use("/openapi.json", developmentDocumentationOnly);
app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get(
	"/openapi.json",
	openAPIRouteHandler(app, {
		documentation: {
			components: {
				securitySchemes: {
					geoimagePermission: {
						type: "http",
						scheme: "bearer",
						bearerFormat: "JWT",
						description: "Location-scoped image permission from the Cataquí API. CDN images remain public.",
					},
				},
			},
			info: {
				title: "Geoimage",
				version: "1.0.0",
				description: "Independent geographic image generation.",
			},
		},
		defaultValidationErrorResponse: false,
	}),
);
app.notFound((context) =>
	createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.ROUTE_NOT_FOUND }),
);
app.onError((error, context) => {
	if (error instanceof GeoimageError) {
		return createGeoimageErrorResponse({ context: context, errorCode: error.errorCode });
	}
	if (error instanceof HTTPException && error.status === 400) {
		return createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.INVALID_REQUEST });
	}
	console.error({ event: "geoimage.request.failed", requestId: context.get("requestId"), responseStatus: 500 });
	return createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.INTERNAL_ERROR });
});
export default app;

export { ImageGenerationDurableObject as GeoImageGeneration } from "./images/image-generation.durable-object";
