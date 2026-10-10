import type { PlacesConfig } from "./schemas/places-config.schema";
import { createGeoapifyHttpError } from "../../shared/geoapify/geoapify-http.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { MapsError } from "../../shared/maps.error";
import {
	getGeoapifyPlaceCategories,
	parseGeoapifyPlaceCategory,
	parseGooglePlacesCategory,
	PlaceCategory,
} from "./place-category";
import type { PlaceAreaSearchOutput } from "./schemas/place-area-search-output.schema";
import { GeoapifyPlaceOutputSchema } from "./schemas/geoapify-place-output.schema";
import { GeoapifyPlacesOutputSchema } from "./schemas/geoapify-places-output.schema";

import type { z } from "zod";
import { GooglePlacesAutocompleteOutputSchema } from "./schemas/google-places-autocomplete-output.schema";
import { GooglePlacesDetailsOutputSchema } from "./schemas/google-places-details-output.schema";
import type { PlaceDetailsOutput } from "./schemas/place-details-output.schema";
import type { PlaceSearchOutput } from "./schemas/place-search-output.schema";

export class PlacesRepository {
	constructor(params: {
		placesConfig: PlacesConfig;
		searchRateLimiter: RateLimit;
		detailsRateLimiter: RateLimit;
		fetchImplementation?: typeof fetch;
	}) {
		this._placesConfig = params.placesConfig;
		this._searchRateLimiter = params.searchRateLimiter;
		this._detailsRateLimiter = params.detailsRateLimiter;
		this._fetchImplementation = params.fetchImplementation;
	}

	private readonly _placesConfig: PlacesConfig;
	private readonly _searchRateLimiter: RateLimit;
	private readonly _detailsRateLimiter: RateLimit;
	private readonly _fetchImplementation: typeof fetch | undefined;
	readonly attribution = { text: "Google Maps" } as const;

	async searchPlacesInArea(params: {
		bounds: { north: number; south: number; east: number; west: number };
		categories: readonly PlaceCategory[];
		limit: number;
		signal?: AbortSignal | undefined;
	}): Promise<PlaceAreaSearchOutput> {
		const url = new URL("https://api.geoapify.com/v2/places");

		url.search = new URLSearchParams({
			categories: getGeoapifyPlaceCategories({ categories: params.categories }).join(","),
			filter: `rect:${params.bounds.west},${params.bounds.north},${params.bounds.east},${params.bounds.south}`,
			limit: String(params.limit),
			apiKey: this._placesConfig.geoapifyApiKey,
		}).toString();

		let response: Response;

		try {
			response = await (this._fetchImplementation ?? fetch)(url, {
				signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(params.signal ? [params.signal] : [])]),
				redirect: "manual",
			});
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true });
			}
			throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: true });
		}
		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			throw createGeoapifyHttpError({ response: response });
		}

		const body = GeoapifyPlacesOutputSchema.safeParse(await response.json().catch(() => null));
		if (!body.success) throw new MapsError({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE, retryable: false });

		return body.data.features.flatMap((feature): PlaceAreaSearchOutput => {
			const place = GeoapifyPlaceOutputSchema.safeParse(feature);
			if (!place.success) return [];

			const properties = place.data.properties;
			const raw = properties.datasource?.raw;
			const category = parseGeoapifyPlaceCategory({ categories: properties.categories });
			// OpenStreetMap separates alternative values with semicolons; the first one is the primary name.
			const name = [raw?.short_name, raw?.name]
				.map((value) => value?.split(";")[0]?.trim())
				.find((value) => value !== undefined && value.length > 0);
			if (category === PlaceCategory.OTHER || name === undefined || name.length === 0) return [];

			return [
				{
					name: name,
					category: category,
					coordinates: { latitude: properties.lat, longitude: properties.lon },
					notable: raw?.wikidata !== undefined,
					...(raw?.brand === undefined ? {} : { brand: raw.brand }),
				},
			];
		});
	}

	async consumeSearchRateLimit(params: { key: string }): Promise<boolean> {
		const result = await this._searchRateLimiter.limit({ key: params.key });
		return result.success;
	}

	async consumeDetailsRateLimit(params: { key: string }): Promise<boolean> {
		const result = await this._detailsRateLimiter.limit({ key: params.key });
		return result.success;
	}

	async getPlaceDetails(params: {
		placeId: string;
		sessionToken: string;
	}): Promise<
		{ kind: "SUCCESS"; output: PlaceDetailsOutput } | { kind: "PLACE_NOT_FOUND" | "TIMEOUT" | "UNAVAILABLE" }
	> {
		const providerUrl = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(params.placeId)}`);
		providerUrl.searchParams.set("sessionToken", params.sessionToken);

		const providerResponse = await this._fetchProvider({
			request: new Request(providerUrl, {
				redirect: "manual",
				headers: {
					"X-Goog-Api-Key": this._placesConfig.googlePlacesApiKey,
					"X-Goog-FieldMask": "location",
				},
				signal: AbortSignal.timeout(5_000),
			}),
		});
		if (providerResponse.kind !== "SUCCESS") return providerResponse;

		if (providerResponse.response.status === 404) return { kind: "PLACE_NOT_FOUND" };
		if (!providerResponse.response.ok) return { kind: "UNAVAILABLE" };

		const providerOutput = await this._parseProviderOutput({
			response: providerResponse.response,
			schema: GooglePlacesDetailsOutputSchema,
		});
		if (providerOutput.kind !== "SUCCESS") return providerOutput;

		return {
			kind: "SUCCESS",
			output: {
				latitude: providerOutput.output.location.latitude,
				longitude: providerOutput.output.location.longitude,
			},
		};
	}

	async searchPlaces(params: {
		languageCode: string;
		query: string;
		sessionToken: string;
	}): Promise<{ kind: "SUCCESS"; output: PlaceSearchOutput } | { kind: "TIMEOUT" | "UNAVAILABLE" }> {
		const providerResponse = await this._fetchProvider({
			request: new Request("https://places.googleapis.com/v1/places:autocomplete", {
				method: "POST",
				redirect: "manual",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": this._placesConfig.googlePlacesApiKey,
					"X-Goog-FieldMask":
						"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text," +
						"suggestions.placePrediction.structuredFormat.mainText.text," +
						"suggestions.placePrediction.structuredFormat.secondaryText.text," +
						"suggestions.placePrediction.types",
				},
				body: JSON.stringify({
					input: params.query,
					languageCode: params.languageCode,
					regionCode: "br",
					includedRegionCodes: ["br"],
					includeQueryPredictions: false,
					sessionToken: params.sessionToken,
					locationRestriction: {
						rectangle: {
							low: { latitude: -24.0016, longitude: -46.8233 },
							high: { latitude: -23.3633, longitude: -46.3664 },
						},
					},
				}),
				signal: AbortSignal.timeout(5_000),
			}),
		});
		if (providerResponse.kind !== "SUCCESS") return providerResponse;

		if (!providerResponse.response.ok) return { kind: "UNAVAILABLE" };

		const providerOutput = await this._parseProviderOutput({
			response: providerResponse.response,
			schema: GooglePlacesAutocompleteOutputSchema,
		});
		if (providerOutput.kind !== "SUCCESS") return providerOutput;

		return {
			kind: "SUCCESS",
			output: {
				suggestions: (providerOutput.output.suggestions ?? []).map(({ placePrediction }) => ({
					placeId: placePrediction.placeId,
					fullText: placePrediction.text.text,
					primaryText: placePrediction.structuredFormat.mainText.text,
					secondaryText: placePrediction.structuredFormat.secondaryText?.text ?? null,
					category: parseGooglePlacesCategory({ placeTypes: placePrediction.types ?? [] }),
				})),
				attribution: this.attribution,
			},
		};
	}

	private async _fetchProvider(params: {
		request: Request;
	}): Promise<{ kind: "SUCCESS"; response: Response } | { kind: "TIMEOUT" | "UNAVAILABLE" }> {
		try {
			const response = await (this._fetchImplementation ?? fetch)(params.request);
			if (!response.ok) {
				// Cleanup failure must preserve the provider status used by the caller.
				await response.body?.cancel().catch(() => undefined);
			}
			return { kind: "SUCCESS", response: response };
		} catch (error) {
			return _providerFailure({ error: error });
		}
	}

	private async _parseProviderOutput<TSchema extends z.ZodType>(params: {
		response: Response;
		schema: TSchema;
	}): Promise<{ kind: "SUCCESS"; output: z.infer<TSchema> } | { kind: "TIMEOUT" | "UNAVAILABLE" }> {
		let providerOutput: unknown;

		try {
			providerOutput = await params.response.json();
		} catch (error) {
			return _providerFailure({ error: error });
		}

		const parsedOutput = params.schema.safeParse(providerOutput);
		if (!parsedOutput.success) return { kind: "UNAVAILABLE" };

		return { kind: "SUCCESS", output: parsedOutput.data };
	}
}

function _providerFailure(params: { error: unknown }): { kind: "TIMEOUT" | "UNAVAILABLE" } {
	if (
		params.error instanceof DOMException &&
		(params.error.name === "TimeoutError" || params.error.name === "AbortError")
	) {
		return { kind: "TIMEOUT" };
	}

	return { kind: "UNAVAILABLE" };
}
