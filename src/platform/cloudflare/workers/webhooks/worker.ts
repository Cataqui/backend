import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { whatsappRoutes } from "./modules/whatsapp/whatsapp.routes";

const app = new Hono<{ Bindings: WebhooksWorkerEnv }>();

app.use("*", async (context, next) => {
	await next();
	context.res.headers.set("Cache-Control", "no-store");
});

app.use(
	"*",
	bodyLimit({
		maxSize: 10 * 1024 * 1024,
		onError: (context) => context.body(null, 413),
	}),
);

app.route("/whatsapp", whatsappRoutes);

app.notFound((context) => context.body(null, 404));

app.onError((error, context) => {
	console.error({
		event: "webhooks.request.failed",
		method: context.req.method,
		path: new URL(context.req.url).pathname,
		responseStatus: 500,
		errorName: error.name,
		errorMessage: error.message,
		errorStack: error.stack,
	});

	return context.body(null, 500);
});

export default app;
