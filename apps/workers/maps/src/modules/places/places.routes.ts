import { createMapsConfig } from "../../shared/config/maps.config";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { mapsAuthMiddleware } from "../../shared/auth/maps-auth.middleware";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import type { IMapsHonoEnvironment } from "../../shared/maps-hono-environment.interface";
import { createMapsErrorResponse } from "../../shared/maps-error.response";
import { createMapsValidationHook } from "../../shared/maps-validation.hook";
import { PlaceSearchOutputSchema } from "./schemas/place-search-output.schema";
import { PlaceDetailsOutputSchema } from "./schemas/place-details-output.schema";
import { createPlacesService } from "./places.module";
import type { PlacesService } from "./places.service";
import { PlaceDetailsInputSchema } from "./schemas/place-details-input.schema";
import { PlaceSearchInputSchema } from "./schemas/place-search-input.schema";
import { PlaceSearchLanguageSchema } from "./schemas/place-search-language.schema";

export function createPlacesRoutes(params?: { service?: PlacesService }): Hono<IMapsHonoEnvironment> {
	const placesRoutes = new Hono<IMapsHonoEnvironment>();

	placesRoutes.use("/*", mapsAuthMiddleware);

	placesRoutes.query(
		"/search",
		sValidator(
			"json",
			PlaceSearchInputSchema,
			createMapsValidationHook({
				message: "The place search request is invalid.",
				fallbackPath: "body",
			}),
		),
		async (context) => {
			const input = context.req.valid("json");
			const languageCode = PlaceSearchLanguageSchema.safeParse(context.req.header("Accept-Language"));

			if (!languageCode.success) {
				return createMapsErrorResponse({
					context: context,
					errorCode: MapsErrorCode.INVALID_REQUEST,
					message: "The place search request is invalid.",
					status: 400,
					violations: languageCode.error.issues.map((issue) => ({
						path: "headers.Accept-Language",
						message: issue.message,
					})),
				});
			}

			const service =
				params?.service ??
				createPlacesService({
					placesConfig: createMapsConfig({ environment: context.env }).placesConfig,
					searchRateLimiter: context.env.PLACE_SEARCH_RATE_LIMITER,
					detailsRateLimiter: context.env.PLACE_DETAILS_RATE_LIMITER,
				});

			return context.json(
				PlaceSearchOutputSchema.parse(
					await service.searchPlaces({
						input: input,
						languageCode: languageCode.data,
						rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedUserId")}`,
					}),
				),
				200,
			);
		},
	);

	placesRoutes.query(
		"/details",
		sValidator(
			"json",
			PlaceDetailsInputSchema,
			createMapsValidationHook({
				message: "The place details request is invalid.",
				fallbackPath: "body",
			}),
		),
		async (context) => {
			const input = context.req.valid("json");

			const service =
				params?.service ??
				createPlacesService({
					placesConfig: createMapsConfig({ environment: context.env }).placesConfig,
					searchRateLimiter: context.env.PLACE_SEARCH_RATE_LIMITER,
					detailsRateLimiter: context.env.PLACE_DETAILS_RATE_LIMITER,
				});

			return context.json(
				PlaceDetailsOutputSchema.parse(
					await service.getPlaceDetails({
						input: input,
						rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedUserId")}`,
					}),
				),
				200,
			);
		},
	);

	for (const route of ["/search", "/details"] as const) {
		placesRoutes.all(route, (context) =>
			createMapsErrorResponse({
				context: context,
				errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
				message: "This route requires the QUERY method.",
				status: 405,
				headers: { Allow: "QUERY" },
			}),
		);
	}

	return placesRoutes;
}
