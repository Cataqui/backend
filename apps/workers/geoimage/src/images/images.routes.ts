import { type Context, Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { createGeoimageErrorResponse } from "../geoimage-error-response";
import type { IGeoimageHonoEnvironment } from "../geoimage-hono-environment.interface";
import { toValidationViolations } from "../validation-violations";
import { ImageRepository } from "./image.repository";
import { ImageService } from "./image.service";
import { GetImageDescription } from "./images.openapi";
import { ImageQuerySchema } from "./schemas/image-query.schema";

export function createImagesRoutes(): Hono<IGeoimageHonoEnvironment> {
	const routes = new Hono<IGeoimageHonoEnvironment>();
	routes.use("/", async (context, next) => {
		if (context.req.method === "GET") return next();
		context.header("Allow", "GET");
		return createGeoimageErrorResponse({ context: context, errorCode: GeoimageErrorCode.METHOD_NOT_ALLOWED });
	});

	routes.get(
		"/",
		describeRoute(GetImageDescription),
		validator("query", ImageQuerySchema, (result, context: Context<IGeoimageHonoEnvironment>) => {
			if (result.success) return;
			const violations = toValidationViolations({ issues: result.error }).map((violation) => ({
				path: violation.path,
				message:
					typeof violation.path[0] === "string" && (context.req.queries(violation.path[0])?.length ?? 0) > 1
						? "Provide this parameter exactly once."
						: violation.message,
			}));
			return createGeoimageErrorResponse({
				context: context,
				errorCode: GeoimageErrorCode.VALIDATION_ERROR,
				violations: violations,
			});
		}),
		async (context) => {
			const input = context.req.valid("query");
			const service = new ImageService({
				images: new ImageRepository({ bucket: context.env.IMAGES, cache: caches.default }),
				generation: context.env.GENERATION,
			});
			return service.getImage({
				input: input,
				environment: context.env.ENVIRONMENT,
				origin: new URL(context.req.url).origin,
				requestId: context.get("requestId"),
				waitUntil: (promise) => context.executionCtx.waitUntil(promise),
			});
		},
	);
	return routes;
}
