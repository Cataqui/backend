import { createMiddleware } from "hono/factory";
import type { IGeovisualHonoEnvironment } from "../geovisual-hono-environment.interface";

export const developmentDocumentationOnly = createMiddleware<IGeovisualHonoEnvironment>(async (context, next) => {
	if (context.env.ENVIRONMENT !== "development") {
		return context.notFound();
	}
	await next();
	return undefined;
});
