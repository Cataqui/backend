import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAddressesRoutes } from "./addresses/addresses.routes";
import { createGeosearchErrorResponseFromError } from "./geosearch-error.handler";
import { GeosearchErrorCode } from "./shared/geosearch-error-code.enum";
import type { IGeosearchHonoEnvironment } from "./shared/geosearch-hono-environment.interface";
import { createGeosearchErrorResponse } from "./shared/geosearch-response.utils";

const app = new Hono<IGeosearchHonoEnvironment>();

app.use("*", async (context, next) => {
	const receivedRequestId = context.req.header("x-request-id");

	const requestId =
		receivedRequestId !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(receivedRequestId)
			? receivedRequestId
			: crypto.randomUUID();

	context.set("requestId", requestId);

	await next();
	context.res.headers.set("Cache-Control", "no-store");
	context.res.headers.set("x-request-id", requestId);
});

app.use(
	"*",
	bodyLimit({
		maxSize: 4 * 1024,
		onError: (context) =>
			createGeosearchErrorResponse(context, {
				errorCode: GeosearchErrorCode.PAYLOAD_TOO_LARGE,
				message: "The request body is too large.",
				status: 413,
			}),
	}),
);

app.get("/v1/health", (context) => context.body(null, 204));
app.route("/v1/addresses", createAddressesRoutes());

app.notFound((context) =>
	createGeosearchErrorResponse(context, {
		errorCode: GeosearchErrorCode.ROUTE_NOT_FOUND,
		message: "The requested route was not found.",
		status: 404,
	}),
);

app.onError((error, context) => createGeosearchErrorResponseFromError({ context: context, error: error }));

export default app;
