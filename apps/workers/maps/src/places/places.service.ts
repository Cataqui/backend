import { injectable } from "tsyringe";
import { PlaceCategory } from "@cataqui/places";
import { AppError } from "../errors/app.error";
import { PlaceDetailsRateLimitedError } from "./errors/place-details-rate-limited.error";
import { PlaceNotFoundError } from "./errors/place-not-found.error";
import { PlaceProviderResponseInvalidError } from "./errors/place-provider-response-invalid.error";
import { PlaceProviderTimeoutError } from "./errors/place-provider-timeout.error";
import { PlaceProviderUnavailableError } from "./errors/place-provider-unavailable.error";
import { PlaceSearchRateLimitedError } from "./errors/place-search-rate-limited.error";
import { PlacesRepository } from "./places.repository";
import { GooglePlacesAutocompleteOutputSchema } from "./google-places-autocomplete-output.schema";
import { GooglePlacesDetailsOutputSchema } from "./google-places-details-output.schema";
import type { PlaceDetailsInput } from "./place-details-input.schema";
import type { PlaceDetailsOutput } from "./place-details-output.schema";
import type { PlaceSearchInput } from "./place-search-input.schema";
import type { PlaceSearchOutput } from "./place-search-output.schema";

@injectable()
export class PlacesService {
	constructor(private readonly _repository: PlacesRepository) {}

	async getPlaceDetails(params: { input: PlaceDetailsInput; rateLimitKey: string }): Promise<PlaceDetailsOutput> {
		const rateLimit = await this._repository.consumeDetailsRateLimit({
			key: params.rateLimitKey,
		});

		if (!rateLimit.success) {
			throw new PlaceDetailsRateLimitedError();
		}

		let providerOutput: unknown;
		try {
			const response = await this._repository.getPlaceDetails({
				placeId: params.input.placeId,
				sessionToken: params.input.sessionToken,
				signal: AbortSignal.timeout(5_000),
			});

			if (response.status === 404) {
				throw new PlaceNotFoundError();
			}
			if (!response.ok) {
				throw new PlaceProviderUnavailableError();
			}
			providerOutput = await response.json();
		} catch (error) {
			throw this._getProviderFailure({ error: error });
		}

		const parsedOutput = GooglePlacesDetailsOutputSchema.safeParse(providerOutput);
		if (!parsedOutput.success) {
			throw new PlaceProviderResponseInvalidError();
		}

		return {
			latitude: parsedOutput.data.location.latitude,
			longitude: parsedOutput.data.location.longitude,
		};
	}

	async searchPlaces(params: {
		input: PlaceSearchInput;
		languageCode: string;
		rateLimitKey: string;
	}): Promise<PlaceSearchOutput> {
		const attribution = { text: "Google Maps" };
		if (params.input.query.length === 0) {
			return { suggestions: [], attribution: attribution };
		}

		const rateLimit = await this._repository.consumeSearchRateLimit({
			key: params.rateLimitKey,
		});
		if (!rateLimit.success) {
			throw new PlaceSearchRateLimitedError();
		}

		let providerOutput: unknown;
		try {
			const response = await this._repository.searchPlaces({
				languageCode: params.languageCode,
				query: params.input.query,
				sessionToken: params.input.sessionToken,
				signal: AbortSignal.timeout(5_000),
			});
			if (!response.ok) {
				throw new PlaceProviderUnavailableError();
			}
			providerOutput = await response.json();
		} catch (error) {
			throw this._getProviderFailure({ error: error });
		}

		const parsedOutput = GooglePlacesAutocompleteOutputSchema.safeParse(providerOutput);
		if (!parsedOutput.success) {
			throw new PlaceProviderResponseInvalidError();
		}

		return {
			suggestions: (parsedOutput.data.suggestions ?? []).map(({ placePrediction }) => ({
				placeId: placePrediction.placeId,
				fullText: placePrediction.text.text,
				primaryText: placePrediction.structuredFormat.mainText.text,
				secondaryText: placePrediction.structuredFormat.secondaryText?.text ?? null,
				category: PlaceCategory.fromGoogle({ types: placePrediction.types ?? [] }),
			})),
			attribution: attribution,
		};
	}

	private _getProviderFailure(params: { error: unknown }): AppError {
		if (params.error instanceof AppError) return params.error;

		const providerTimedOut =
			params.error instanceof DOMException &&
			(params.error.name === "TimeoutError" || params.error.name === "AbortError");
		if (providerTimedOut) {
			return new PlaceProviderTimeoutError();
		}
		if (params.error instanceof SyntaxError) return new PlaceProviderResponseInvalidError();
		return new PlaceProviderUnavailableError();
	}
}
