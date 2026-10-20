import { inject, injectable } from "tsyringe";
import { PlacesConfig } from "./places.config";

export const PlaceSearchRateLimiter = Symbol("PlaceSearchRateLimiter");
export const PlaceDetailsRateLimiter = Symbol("PlaceDetailsRateLimiter");

@injectable()
export class PlacesRepository {
	constructor(
		@inject(PlacesConfig) placesConfig: PlacesConfig,
		@inject(PlaceSearchRateLimiter) searchRateLimiter: RateLimit,
		@inject(PlaceDetailsRateLimiter) detailsRateLimiter: RateLimit,
	) {
		this._placesConfig = placesConfig;
		this._searchRateLimiter = searchRateLimiter;
		this._detailsRateLimiter = detailsRateLimiter;
	}

	private readonly _placesConfig: PlacesConfig;
	private readonly _searchRateLimiter: RateLimit;
	private readonly _detailsRateLimiter: RateLimit;

	consumeSearchRateLimit(params: { key: string }): Promise<RateLimitOutcome> {
		return this._searchRateLimiter.limit({ key: params.key });
	}

	consumeDetailsRateLimit(params: { key: string }): Promise<RateLimitOutcome> {
		return this._detailsRateLimiter.limit({ key: params.key });
	}

	getPlaceDetails(params: { placeId: string; sessionToken: string; signal: AbortSignal }): Promise<Response> {
		const providerUrl = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(params.placeId)}`);
		providerUrl.searchParams.set("sessionToken", params.sessionToken);

		return this._fetchProvider({
			request: new Request(providerUrl, {
				redirect: "manual",
				headers: {
					"X-Goog-Api-Key": this._placesConfig.googlePlacesApiKey,
					"X-Goog-FieldMask": "location",
				},
				signal: params.signal,
			}),
		});
	}

	searchPlaces(params: {
		languageCode: string;
		query: string;
		sessionToken: string;
		signal: AbortSignal;
	}): Promise<Response> {
		return this._fetchProvider({
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
				signal: params.signal,
			}),
		});
	}

	private async _fetchProvider(params: { request: Request }): Promise<Response> {
		const response = await fetch(params.request);
		if (!response.ok) {
			// Cleanup failure must preserve the provider status used by the service.
			void response.body?.cancel().catch(() => undefined);
		}
		return response;
	}
}
