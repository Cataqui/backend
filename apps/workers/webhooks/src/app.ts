import {
	getSourceSafeErrorTelemetryFields,
	getTelemetryHttpRequestMethod,
	getWorkerVersion,
	ObservabilityEventConstants,
} from "@cataqui/observability-contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createWhatsappRoutes } from "./whatsapp/whatsapp.routes";

function _getWebhooksTelemetryRoute(params: { pathname: string }): "/whatsapp" | "UNMATCHED" {
	if (params.pathname === "/whatsapp" || params.pathname.startsWith("/whatsapp/")) return "/whatsapp";
	return "UNMATCHED";
}

const app = new Hono<WebhooksWorkerHonoEnvironment>();

app.use("*", async (context, next) => {
	const requestId = crypto.randomUUID();
	const requestStartedAt = performance.now();
	context.set("requestId", requestId);
	context.set("requestErrorTelemetry", undefined);

	try {
		await next();
	} catch (error: unknown) {
		context.set("requestErrorTelemetry", getSourceSafeErrorTelemetryFields({ error: error }));
		context.res = context.body(null, 500);
	}

	context.res.headers.set("Cache-Control", "no-store");
	context.res.headers.set("x-request-id", requestId);

	const lifecycleLogFields = {
		durationMilliseconds: performance.now() - requestStartedAt,
		env: context.env.NODE_ENV,
		method: getTelemetryHttpRequestMethod({ requestMethod: context.req.method }),
		requestId: requestId,
		responseStatus: context.res.status,
		route: _getWebhooksTelemetryRoute({ pathname: new URL(context.req.url).pathname }),
		service: `cataqui-webhooks-${context.env.NODE_ENV}`,
		version: getWorkerVersion({ metadata: context.env.WORKER_VERSION_METADATA }),
	};
	const requestErrorTelemetry = context.get("requestErrorTelemetry");

	if (requestErrorTelemetry !== undefined) {
		console.error({
			...lifecycleLogFields,
			...requestErrorTelemetry,
			event: ObservabilityEventConstants.WEBHOOKS_REQUEST_FAILED_EVENT,
			outcome: "THREW",
		});
		return;
	}

	if (context.res.status >= 500) {
		console.error({
			...lifecycleLogFields,
			event: ObservabilityEventConstants.WEBHOOKS_REQUEST_REJECTED_EVENT,
			outcome: "REJECTED",
		});
		return;
	}

	const log = context.res.status >= 400 ? console.warn : console.log;
	log({
		...lifecycleLogFields,
		event: ObservabilityEventConstants.WEBHOOKS_REQUEST_COMPLETED_EVENT,
		outcome: context.res.status >= 400 ? "CLIENT_REJECTED" : "SUCCESS",
	});
});

app.use(
	"*",
	bodyLimit({
		maxSize: 10 * 1024 * 1024,
		onError: (context) => context.body(null, 413),
	}),
);

app.route("/whatsapp", createWhatsappRoutes());

app.notFound((context) => context.body(null, 404));

app.onError((error, context) => {
	context.set("requestErrorTelemetry", getSourceSafeErrorTelemetryFields({ error: error }));
	return context.body(null, 500);
});

export default app;
