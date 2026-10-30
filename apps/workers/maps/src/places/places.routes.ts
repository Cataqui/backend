import type { PlaceSearchResponseOutput } from "./place-search-response-output.schema";
import type { PlaceDetailsResponseOutput } from "./place-details-response-output.schema";
import { searchPlacesDocs, getPlaceDetailsDocs } from "./places.openapi";
import { toValidationViolations } from "@cataqui/response";
import { validator } from "hono-openapi";
import { Hono } from "hono";
import { methodNotAllowed } from "hono/method-not-allowed";
import { requireAccount } from "../http/authentication.middleware";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import type { MapsContext } from "../http/context";
import { createMapsErrorResponse } from "../http/maps-error.response";
import { createMapsValidationHook } from "../http/maps-validation.hook";
import { successResponse } from "../http/success-response";
import { PlacesService } from "./places.service";
import { PlaceDetailsInputSchema } from "./place-details-input.schema";
import { PlaceSearchInputSchema } from "./place-search-input.schema";
import { PlaceSearchHeadersInputSchema } from "./place-search-headers-input.schema";

export const placesRoutes = new Hono<MapsContext>();

placesRoutes.use("/*", requireAccount);
placesRoutes.use(
	"/*",
	methodNotAllowed({
		app: placesRoutes,
		onMethodNotAllowed: (context, methods) =>
			createMapsErrorResponse({
				context: context,
				errorCode: MapsErrorCode.METHOD_NOT_ALLOWED,
				message: "This route requires the QUERY method.",
				status: 405,
				headers: { Allow: methods.join(", ") },
			}),
	}),
);

placesRoutes.query(
	"/search",
	validator(
		"json",
		PlaceSearchInputSchema,
		createMapsValidationHook({
			message: "The place search request is invalid.",
			fallbackPath: "body",
		}),
	),
	validator<typeof PlaceSearchHeadersInputSchema, "header", MapsContext, string>(
		"header",
		PlaceSearchHeadersInputSchema,
		(result, context) => {
			if (result.success) return;
			return createMapsErrorResponse({
				context: context,
				errorCode: MapsErrorCode.INVALID_REQUEST,
				message: "The place search request is invalid.",
				status: 400,
				violations: toValidationViolations({ issues: result.error }).map((violation) => ({
					path: ["headers", "Accept-Language", ...violation.path.slice(1)],
					message: violation.message,
				})),
			});
		},
		{ options: { io: "input" } },
	),
	searchPlacesDocs,
	async (context) => {
		const input = context.req.valid("json");

		const service = context.var.resolve(PlacesService);

		const data = await service.searchPlaces({
			input: input,
			languageCode: context.req.valid("header")["accept-language"],
			rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedAccountId")}`,
		});
		const output = successResponse({ context: context, data: data }) satisfies PlaceSearchResponseOutput;

		return context.json(output, 200);
	},
);

placesRoutes.query(
	"/details",
	validator(
		"json",
		PlaceDetailsInputSchema,
		createMapsValidationHook({
			message: "The place details request is invalid.",
			fallbackPath: "body",
		}),
	),
	getPlaceDetailsDocs,
	async (context) => {
		const input = context.req.valid("json");

		const service = context.var.resolve(PlacesService);

		const data = await service.getPlaceDetails({
			input: input,
			rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedAccountId")}`,
		});
		const output = successResponse({ context: context, data: data }) satisfies PlaceDetailsResponseOutput;

		return context.json(output, 200);
	},
);
