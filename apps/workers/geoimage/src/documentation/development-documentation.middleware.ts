import { createMiddleware } from "hono/factory";
import type { IGeoimageHonoEnvironment } from "../geoimage-hono-environment.interface";

export const developmentDocumentationOnly = createMiddleware<IGeoimageHonoEnvironment>(async (context, next) => {
	if (context.env.ENVIRONMENT !== "development") {
		return context.notFound();
	}
	await next();
	return undefined;
});
