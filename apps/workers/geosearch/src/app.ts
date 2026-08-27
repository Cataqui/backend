import {
	getSourceSafeErrorTelemetryFields,
	getTelemetryHttpRequestMethod,
	getWorkerVersion,
	ObservabilityEventConstants,
} from "@cataqui/observability-contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAddressesRoutes } from "./addresses/addresses.routes";
import { createGeosearchErrorResponseFromError } from "./geosearch-error.handler";
import { GeosearchErrorCode } from "./shared/geosearch-error-code.enum";
import type { IGeosearchHonoEnvironment } from "./shared/geosearch-hono-environment.interface";
import { createGeosearchErrorResponse } from "./shared/geosearch-response.utils";
import { getGeosearchServiceName } from "./shared/geosearch-telemetry";

function _getGeosearchTelemetryRoute(params: {
	pathname: string;
}): "/v1/addresses/details" | "/v1/addresses/search" | "/v1/health" | "UNMATCHED" {
	switch (params.pathname) {
		case "/v1/addresses/details":
			return "/v1/addresses/details";
		case "/v1/addresses/search":
			return "/v1/addresses/search";
		case "/v1/health":
			return "/v1/health";
	}

	return "UNMATCHED";
}

const app = new Hono<IGeosearchHonoEnvironment>();

app.use("*", async (context, next) => {
	const receivedRequestId = context.req.header("x-request-id");
	const requestId =
		receivedRequestId !== undefined && /^[A-Za-z0-9._:-]{1,128}$/.test(receivedRequestId)
			? receivedRequestId
			: crypto.randomUUID();
	const requestStartedAt = performance.now();
	context.set("requestId", requestId);
	context.set("requestErrorTelemetry", undefined);

	try {
		await next();
	} catch (error: unknown) {
		context.set("requestErrorTelemetry", getSourceSafeErrorTelemetryFields({ error: error }));
		context.res = createGeosearchErrorResponse(context, {
			errorCode: GeosearchErrorCode.INTERNAL_ERROR,
			message: "An unexpected error occurred.",
			status: 500,
		});
	}

	context.res.headers.set("Cache-Control", "no-store");
	context.res.headers.set("x-request-id", requestId);

	const lifecycleLogFields = {
		durationMilliseconds: performance.now() - requestStartedAt,
		env: context.env.ENVIRONMENT,
		method: getTelemetryHttpRequestMethod({ requestMethod: context.req.method }),
		requestId: requestId,
		responseStatus: context.res.status,
		route: _getGeosearchTelemetryRoute({ pathname: new URL(context.req.url).pathname }),
		service: getGeosearchServiceName({ environment: context.env.ENVIRONMENT }),
		version: getWorkerVersion({ metadata: context.env.WORKER_VERSION_METADATA }),
	};
	const requestErrorTelemetry = context.get("requestErrorTelemetry");

	if (requestErrorTelemetry !== undefined) {
		console.error({
			...lifecycleLogFields,
			...requestErrorTelemetry,
			event: ObservabilityEventConstants.GEOSEARCH_REQUEST_FAILED_EVENT,
			outcome: "THREW",
		});
		return;
	}

	if (context.res.status >= 500) {
		console.error({
			...lifecycleLogFields,
			event: ObservabilityEventConstants.GEOSEARCH_REQUEST_REJECTED_EVENT,
			outcome: "REJECTED",
		});
		return;
	}

	const log = context.res.status >= 400 ? console.warn : console.log;
	log({
		...lifecycleLogFields,
		event: ObservabilityEventConstants.GEOSEARCH_REQUEST_COMPLETED_EVENT,
		outcome: context.res.status >= 400 ? "CLIENT_REJECTED" : "SUCCESS",
	});
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
