import "reflect-metadata";
import { PayloadTooLargeError } from "#maps/http/errors/payload-too-large.error";
import { RouteNotFoundError } from "#maps/http/errors/route-not-found.error";
import { healthRoutes } from "#maps/health/health.routes";
import { createMapsErrorResponseFromError } from "#maps/http/maps-error.handler";
import type { MapsContext } from "#maps/http/context";
import { registerMapsDependencies } from "#maps/maps-dependencies";
import { mapsOpenApiOptions } from "#maps/http/openapi";
import { placesRoutes } from "#maps/places/places.routes";
import { staticRoutes } from "#maps/static/static.routes";
import { tsyringe } from "@hono/tsyringe";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import type { DependencyContainer } from "tsyringe";

const app = new Hono<MapsContext>();

app.use("*", requestId());

app.use("*", async (context, next) => {
	await next();

	if (context.res.status >= 400 || !context.res.headers.has("Cache-Control")) {
		context.res.headers.set("Cache-Control", "no-store");
	}
});

app.use(
	"*",
	bodyLimit({
		maxSize: 4 * 1024,
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
			registerMapsDependencies({
				container: childContainer,
				environment: context.env,
			});
		})(context, next);
	} finally {
		await scope?.dispose();
	}
});

app.get("/openapi.json", openAPIRouteHandler(app, mapsOpenApiOptions));

app.route("/v1/health", healthRoutes);
app.route("/places", placesRoutes);
app.route("/static", staticRoutes);

app.notFound(() => {
	throw new RouteNotFoundError();
});

app.onError((error, context) => createMapsErrorResponseFromError({ context: context, error: error }));

export default app;

export { WorkerEntrypoint } from "#maps/rpc/entrypoint";
