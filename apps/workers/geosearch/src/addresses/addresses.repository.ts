import type { z } from "zod";
import { AddressDetailsOutputSchema } from "./schemas/address-details-output.schema";
import { AddressSearchOutputSchema } from "./schemas/address-search-output.schema";
import { GooglePlacesAutocompleteOutputSchema } from "./schemas/google-places-autocomplete-output.schema";
import { GooglePlacesDetailsOutputSchema } from "./schemas/google-places-details-output.schema";

export class AddressesRepository {
	constructor(params?: { fetchImplementation?: typeof fetch }) {
		this._fetchImplementation = params?.fetchImplementation;
	}

	private readonly _fetchImplementation: typeof fetch | undefined;
	readonly attribution = { text: "Google Maps" } as const;

	async getAddressDetails(params: {
		addressId: string;
		apiKey: string;
		sessionToken: string;
	}): Promise<
		| { kind: "SUCCESS"; output: z.infer<typeof AddressDetailsOutputSchema> }
		| { kind: "ADDRESS_NOT_FOUND" | "TIMEOUT" | "UNAVAILABLE" }
	> {
		const providerUrl = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(params.addressId)}`);
		providerUrl.searchParams.set("sessionToken", params.sessionToken);

		const providerResponse = await this._fetchProvider({
			request: new Request(providerUrl, {
				headers: {
					"X-Goog-Api-Key": params.apiKey,
					"X-Goog-FieldMask": "location",
				},
				signal: AbortSignal.timeout(5_000),
			}),
		});
		if (providerResponse.kind !== "SUCCESS") return providerResponse;

		if (providerResponse.response.status === 404) return { kind: "ADDRESS_NOT_FOUND" };
		if (!providerResponse.response.ok) return { kind: "UNAVAILABLE" };

		const providerOutput = await this._parseProviderOutput({
			response: providerResponse.response,
			schema: GooglePlacesDetailsOutputSchema,
		});
		if (providerOutput === null) return { kind: "UNAVAILABLE" };

		return {
			kind: "SUCCESS",
			output: AddressDetailsOutputSchema.parse({
				latitude: providerOutput.location.latitude,
				longitude: providerOutput.location.longitude,
			}),
		};
	}

	async searchAddresses(params: {
		apiKey: string;
		languageCode: string;
		query: string;
		sessionToken: string;
	}): Promise<
		{ kind: "SUCCESS"; output: z.infer<typeof AddressSearchOutputSchema> } | { kind: "TIMEOUT" | "UNAVAILABLE" }
	> {
		const providerResponse = await this._fetchProvider({
			request: new Request("https://places.googleapis.com/v1/places:autocomplete", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": params.apiKey,
					"X-Goog-FieldMask":
						"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text," +
						"suggestions.placePrediction.structuredFormat.mainText.text," +
						"suggestions.placePrediction.structuredFormat.secondaryText.text",
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
		if (providerOutput === null) return { kind: "UNAVAILABLE" };

		return {
			kind: "SUCCESS",
			output: AddressSearchOutputSchema.parse({
				suggestions: (providerOutput.suggestions ?? []).map(({ placePrediction }) => ({
					addressId: placePrediction.placeId,
					fullText: placePrediction.text.text,
					primaryText: placePrediction.structuredFormat.mainText.text,
					secondaryText: placePrediction.structuredFormat.secondaryText?.text ?? null,
				})),
				attribution: this.attribution,
			}),
		};
	}

	private async _fetchProvider(params: {
		request: Request;
	}): Promise<{ kind: "SUCCESS"; response: Response } | { kind: "TIMEOUT" | "UNAVAILABLE" }> {
		try {
			return { kind: "SUCCESS", response: await (this._fetchImplementation ?? fetch)(params.request) };
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				return { kind: "TIMEOUT" };
			}

			return { kind: "UNAVAILABLE" };
		}
	}

	private async _parseProviderOutput<TSchema extends z.ZodType>(params: {
		response: Response;
		schema: TSchema;
	}): Promise<z.infer<TSchema> | null> {
		let providerOutput: unknown;

		try {
			providerOutput = await params.response.json();
		} catch {
			return null;
		}

		const parsedOutput = params.schema.safeParse(providerOutput);
		if (!parsedOutput.success) return null;

		return parsedOutput.data;
	}
}
