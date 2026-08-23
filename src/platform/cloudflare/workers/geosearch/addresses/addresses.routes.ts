import { sValidator } from "@hono/standard-validator";
import { Hono, type Context } from "hono";
import { geosearchAuthMiddleware } from "../auth/geosearch-auth.middleware";
import { GeosearchErrorCode } from "../shared/geosearch-error-code.enum";
import type { IGeosearchHonoEnvironment } from "../shared/geosearch-hono-environment.interface";
import { createGeosearchErrorResponse } from "../shared/geosearch-response.utils";
import { AddressesService } from "./addresses.service";
import { AddressDetailsInputSchema } from "./schemas/address-details-input.schema";
import { AddressSearchInputSchema } from "./schemas/address-search-input.schema";

export function createAddressesRoutes(params?: { service?: AddressesService }): Hono<IGeosearchHonoEnvironment> {
	const addressesRoutes = new Hono<IGeosearchHonoEnvironment>();
	const service = params?.service ?? new AddressesService();

	addressesRoutes.use("/*", geosearchAuthMiddleware);

	addressesRoutes.query(
		"/search",
		sValidator("json", AddressSearchInputSchema, (result, context: Context<IGeosearchHonoEnvironment>) => {
			if (result.success) return;

			return createGeosearchErrorResponse(context, {
				errorCode: GeosearchErrorCode.INVALID_REQUEST,
				message: "The address search request is invalid.",
				status: 400,
			});
		}),
		async (context) => {
			const input = context.req.valid("json");
			const languageCode = _getLanguageCodeOrNull(context.req.header("Accept-Language"));

			if (languageCode === null) {
				return createGeosearchErrorResponse(context, {
					errorCode: GeosearchErrorCode.INVALID_REQUEST,
					message: "The address search request is invalid.",
					status: 400,
				});
			}

			return context.json(
				await service.searchAddresses({
					apiKey: context.env.GOOGLE_PLACES_API_KEY,
					input: input,
					languageCode: languageCode,
					rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedUserId")}`,
					rateLimiter: context.env.ADDRESS_SEARCH_RATE_LIMITER,
				}),
				200,
			);
		},
	);

	addressesRoutes.query(
		"/details",
		sValidator("json", AddressDetailsInputSchema, (result, context: Context<IGeosearchHonoEnvironment>) => {
			if (result.success) return;

			return createGeosearchErrorResponse(context, {
				errorCode: GeosearchErrorCode.INVALID_REQUEST,
				message: "The address details request is invalid.",
				status: 400,
			});
		}),
		async (context) => {
			const input = context.req.valid("json");

			return context.json(
				await service.getAddressDetails({
					apiKey: context.env.GOOGLE_PLACES_API_KEY,
					input: input,
					rateLimitKey: `${context.env.ENVIRONMENT}:${context.get("authenticatedUserId")}`,
					rateLimiter: context.env.ADDRESS_DETAILS_RATE_LIMITER,
				}),
				200,
			);
		},
	);

	for (const route of ["/search", "/details"] as const) {
		addressesRoutes.all(route, (context) =>
			createGeosearchErrorResponse(context, {
				errorCode: GeosearchErrorCode.METHOD_NOT_ALLOWED,
				message: "This route requires the QUERY method.",
				status: 405,
				headers: { Allow: "QUERY" },
			}),
		);
	}

	return addressesRoutes;
}

function _getLanguageCodeOrNull(acceptLanguage: string | undefined): string | null {
	if (acceptLanguage === undefined || acceptLanguage.trim().length === 0) return "en-US";

	const primaryLanguage = acceptLanguage.split(",", 1)[0]?.split(";", 1)[0]?.trim();
	if (primaryLanguage === undefined || primaryLanguage.length === 0) return "en-US";

	try {
		return Intl.getCanonicalLocales(primaryLanguage)[0] ?? null;
	} catch {
		return null;
	}
}
