import type { PlaceAreaSearchOutput } from "./schemas/place-area-search-output.schema";
import type { PlaceCategory } from "./place-category";
import type { PlacesRepository } from "./places.repository";
import { PlaceDetailsRateLimitedError } from "./errors/place-details-rate-limited.error";
import { PlaceNotFoundError } from "./errors/place-not-found.error";
import { PlaceProviderTimeoutError } from "./errors/place-provider-timeout.error";
import { PlaceProviderUnavailableError } from "./errors/place-provider-unavailable.error";
import { PlaceSearchRateLimitedError } from "./errors/place-search-rate-limited.error";
import type { PlaceDetailsInput } from "./schemas/place-details-input.schema";
import type { PlaceDetailsOutput } from "./schemas/place-details-output.schema";
import type { PlaceSearchInput } from "./schemas/place-search-input.schema";
import type { PlaceSearchOutput } from "./schemas/place-search-output.schema";

export class PlacesService {
	constructor(params: { repository: PlacesRepository }) {
		this._repository = params.repository;
	}

	private readonly _repository: PlacesRepository;

	async searchPlacesInArea(params: {
		bounds: { north: number; south: number; east: number; west: number };
		categories: readonly PlaceCategory[];
		limit: number;
		signal?: AbortSignal | undefined;
	}): Promise<PlaceAreaSearchOutput> {
		return this._repository.searchPlacesInArea({
			bounds: {
				north: params.bounds.north,
				south: params.bounds.south,
				east: params.bounds.east,
				west: params.bounds.west,
			},
			categories: params.categories,
			limit: params.limit,
			signal: params.signal,
		});
	}

	async getPlaceDetails(params: { input: PlaceDetailsInput; rateLimitKey: string }): Promise<PlaceDetailsOutput> {
		const allowed = await this._repository.consumeDetailsRateLimit({
			key: params.rateLimitKey,
		});

		if (!allowed) {
			throw new PlaceDetailsRateLimitedError();
		}

		const result = await this._repository.getPlaceDetails({
			placeId: params.input.placeId,
			sessionToken: params.input.sessionToken,
		});

		switch (result.kind) {
			case "SUCCESS":
				return result.output;
			case "PLACE_NOT_FOUND":
				throw new PlaceNotFoundError();
			case "TIMEOUT":
				throw new PlaceProviderTimeoutError();
			case "UNAVAILABLE":
				throw new PlaceProviderUnavailableError();
		}
	}

	async searchPlaces(params: {
		input: PlaceSearchInput;
		languageCode: string;
		rateLimitKey: string;
	}): Promise<PlaceSearchOutput> {
		if (params.input.query.length === 0) {
			return { suggestions: [], attribution: this._repository.attribution };
		}

		const allowed = await this._repository.consumeSearchRateLimit({
			key: params.rateLimitKey,
		});
		if (!allowed) {
			throw new PlaceSearchRateLimitedError();
		}

		const result = await this._repository.searchPlaces({
			languageCode: params.languageCode,
			query: params.input.query,
			sessionToken: params.input.sessionToken,
		});

		switch (result.kind) {
			case "SUCCESS":
				return result.output;
			case "TIMEOUT":
				throw new PlaceProviderTimeoutError();
			case "UNAVAILABLE":
				throw new PlaceProviderUnavailableError();
		}
	}
}
