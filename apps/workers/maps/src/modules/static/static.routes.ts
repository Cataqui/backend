import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import type { IMapsHonoEnvironment } from "../../shared/maps-hono-environment.interface";
import { createMapsErrorResponse } from "../../shared/maps-error.response";
import { StaticVariantInputSchema } from "./schemas/static-variant-input.schema";
import { StaticInputSchema } from "./schemas/static-input.schema";
import { StaticRepresentation } from "./static-representation";
import { createMapsValidationHook } from "../../shared/maps-validation.hook";
import { createStaticService } from "./static.module";

export function createStaticRoutes(): Hono<IMapsHonoEnvironment> {
	const routes = new Hono<IMapsHonoEnvironment>();
	routes.on(
		["HEAD", "GET"],
		"/:id",
		sValidator(
			"param",
			StaticInputSchema,
			createMapsValidationHook({ message: "The static image reference is invalid.", fallbackPath: "params" }),
		),
		sValidator(
			"query",
			StaticVariantInputSchema,
			createMapsValidationHook({ message: "The static image variant is invalid.", fallbackPath: "query" }),
		),
		async (context) => {
			const input = context.req.valid("param");
			const variant = context.req.valid("query");
			const modifiedSince = context.req.header("If-Modified-Since");
			const date = modifiedSince === undefined ? undefined : new Date(modifiedSince);
			const image = await createStaticService({ environment: context.env }).findImage({
				id: input.id,
				size: variant.size,
				scale: variant.scale,
				zoom: variant.zoom,
				etagDoesNotMatch: context.req.header("If-None-Match"),
				uploadedAfter: date !== undefined && Number.isFinite(date.getTime()) ? date : undefined,
			});
			if (image === null)
				return createMapsErrorResponse({
					context: context,
					errorCode: MapsErrorCode.IMAGE_NOT_FOUND,
					message: "The static image was not found.",
					status: 404,
				});
			const headers = new Headers({
				"Content-Type": StaticRepresentation.contentType,
				"Cache-Control": StaticRepresentation.cacheControl,
				ETag: image.etag,
				"Last-Modified": image.uploaded.toUTCString(),
				"X-Content-Type-Options": "nosniff",
			});
			if (image.kind === "not-modified") return new Response(null, { status: 304, headers: headers });
			headers.set("Content-Length", String(image.size));
			if (context.req.method === "HEAD") {
				await image.body.cancel();
				return new Response(null, { headers: headers });
			}
			return new Response(image.body, { headers: headers });
		},
	);
	routes.all("/:id", (context) =>
		createMapsErrorResponse({
			context: context,
			errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
			message: "Static images support GET and HEAD requests.",
			status: 405,
			headers: { Allow: "GET, HEAD" },
		}),
	);
	return routes;
}
