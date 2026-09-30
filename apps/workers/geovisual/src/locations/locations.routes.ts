import { type Context, Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { GeovisualErrorCode } from "../geovisual-error-code.enum";
import { createGeovisualErrorResponse } from "../geovisual-error-response";
import type { IGeovisualHonoEnvironment } from "../geovisual-hono-environment.interface";
import { toValidationViolations } from "../validation-violations";
import { getGeoapifyConfig } from "./geoapify.config";
import { GeoapifyRepository } from "./geoapify.repository";
import { GenerateLocationDescription } from "./locations.openapi";
import { LocationsService } from "./locations.service";
import { LocationInputSchema } from "./schemas/location-input.schema";

export function createLocationsRoutes(): Hono<IGeovisualHonoEnvironment> {
	const routes = new Hono<IGeovisualHonoEnvironment>();

	routes.post(
		"/",
		describeRoute(GenerateLocationDescription),
		validator("json", LocationInputSchema, (result, context: Context<IGeovisualHonoEnvironment>) => {
			if (result.success) return;
			// Match the JSON media types and parameters accepted by Hono's validator.
			if (
				!/^application\/([a-z-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/i.test(context.req.header("Content-Type") ?? "")
			) {
				return createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.INVALID_REQUEST });
			}
			return createGeovisualErrorResponse({
				context: context,
				errorCode: GeovisualErrorCode.VALIDATION_ERROR,
				violations: toValidationViolations({ issues: result.error }),
			});
		}),

		async (context) => {
			const service = new LocationsService({
				repository: new GeoapifyRepository({ config: getGeoapifyConfig({ env: context.env }) }),
			});

			const image = await service.generateLocationVisual({
				input: context.req.valid("json"),
			});

			return new Response(image, { headers: { "Content-Type": "image/jpeg" } });
		},
	);

	routes.all("/", (context) => {
		context.header("Allow", "POST");
		return createGeovisualErrorResponse({ context: context, errorCode: GeovisualErrorCode.METHOD_NOT_ALLOWED });
	});

	return routes;
}
