import { createFactory } from "hono/factory";
import { getStaticImageDocs, headStaticImageDocs } from "./static.openapi";
import { validator } from "hono-openapi";
import { Hono } from "hono";
import { etag, RETAINED_304_HEADERS } from "hono/etag";
import { methodNotAllowed } from "hono/method-not-allowed";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import { createMapsErrorResponse } from "../http/maps-error.response";
import type { MapsContext } from "../http/context";
import { createMapsValidationHook } from "../http/maps-validation.hook";
import { ImageNotFoundError } from "./errors/image-not-found.error";
import { StaticImageDeliveryInputSchema } from "./static-image-delivery-input.schema";
import { StaticReadQueryInputSchema } from "./static-read-query-input.schema";
import { StaticService } from "./static.service";

export const staticRoutes = new Hono<MapsContext>();
staticRoutes.use(
	"*",
	methodNotAllowed({
		app: staticRoutes,
		onMethodNotAllowed: (context, methods) =>
			createMapsErrorResponse({
				context: context,
				errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
				message: "Static images support GET and HEAD requests.",
				status: 405,
				headers: { Allow: methods.join(", ") },
			}),
	}),
);
const _imagePath = "/v1/:image";

const _imageHandlers = createFactory<MapsContext>().createHandlers(
	etag({
		retainedHeaders: [...RETAINED_304_HEADERS, "x-request-id", "x-content-type-options"],
	}),
	validator(
		"query",
		StaticReadQueryInputSchema,
		createMapsValidationHook({
			message: "Static images require one supported size query parameter.",
			fallbackPath: "query",
		}),
	),
	validator(
		"param",
		StaticImageDeliveryInputSchema,
		createMapsValidationHook({ message: "The static image path is invalid.", fallbackPath: "params" }),
		{ options: { io: "input" } },
	),
	async (context) => {
		const input = context.req.valid("param");
		const service = context.var.resolve(StaticService);
		const image = await service.generateImage({
			reference: input.reference,
			size: context.req.valid("query").size,
			signal: context.req.raw.signal,
		});
		if (image === null) throw new ImageNotFoundError();
		return context.body(image.bytes, 200, {
			"Content-Type": image.contentType,
			"Cache-Control": "public, max-age=31536000, stale-if-error=31536000",
			ETag: `W/"${image.digest}"`,
			"X-Content-Type-Options": "nosniff",
		});
	},
);
staticRoutes.get(_imagePath, getStaticImageDocs, ..._imageHandlers);
staticRoutes.on("HEAD", _imagePath, headStaticImageDocs, ..._imageHandlers);
