import type { z } from "zod";
import type { PlaceDetailsOutput } from "./schemas/place-details-output.schema";
import type { PlaceSearchOutput } from "./schemas/place-search-output.schema";
import { GooglePlacesAutocompleteOutputSchema } from "./schemas/google-places-autocomplete-output.schema";
import { GooglePlacesDetailsOutputSchema } from "./schemas/google-places-details-output.schema";
import { parseGooglePlacesCategory } from "./google-places-category.parser";

export class PlacesRepository {
	constructor(params: {
		apiKey: string;
		searchRateLimiter: RateLimit;
		detailsRateLimiter: RateLimit;
		fetchImplementation?: typeof fetch;
	}) {
		this._apiKey = params.apiKey;
		this._searchRateLimiter = params.searchRateLimiter;
		this._detailsRateLimiter = params.detailsRateLimiter;
		this._fetchImplementation = params.fetchImplementation;
	}

	private readonly _apiKey: string;
	private readonly _searchRateLimiter: RateLimit;
	private readonly _detailsRateLimiter: RateLimit;
	private readonly _fetchImplementation: typeof fetch | undefined;
	readonly attribution = { text: "Google Maps" } as const;

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
					"X-Goog-Api-Key": this._apiKey,
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
					"X-Goog-Api-Key": this._apiKey,
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
