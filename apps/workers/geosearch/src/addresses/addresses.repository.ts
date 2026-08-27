import { getSourceSafeErrorTelemetryFields, ObservabilityEventConstants } from "@cataqui/observability-contracts";
import type { z } from "zod";
import { AddressDetailsOutputSchema } from "./schemas/address-details-output.schema";
import { AddressSearchOutputSchema } from "./schemas/address-search-output.schema";
import { GooglePlacesAutocompleteOutputSchema } from "./schemas/google-places-autocomplete-output.schema";
import { GooglePlacesDetailsOutputSchema } from "./schemas/google-places-details-output.schema";
import { parseGooglePlacesAddressCategory } from "./google-places-address-category.parser";
import {
	GeosearchProviderFailureReason,
	GeosearchProviderOperation,
	getGeosearchServiceName,
	type GeosearchTelemetryContext,
} from "../shared/geosearch-telemetry";

type GeosearchProviderUnavailableResult =
	| {
			kind: "UNAVAILABLE";
			failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID;
			providerStatusCode: number;
	  }
	| {
			kind: "UNAVAILABLE";
			failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_REJECTED;
			providerStatusCode: number;
	  }
	| {
			kind: "UNAVAILABLE";
			failureReason: GeosearchProviderFailureReason.TRANSPORT_UNAVAILABLE;
	  };

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
		telemetryContext: GeosearchTelemetryContext;
	}): Promise<
		| { kind: "SUCCESS"; output: z.infer<typeof AddressDetailsOutputSchema> }
		| { kind: "ADDRESS_NOT_FOUND" | "TIMEOUT" }
		| GeosearchProviderUnavailableResult
	> {
		return this._getProviderResultWithLifecycleTelemetry({
			execute: async () => {
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
				if (!providerResponse.response.ok) {
					return {
						kind: "UNAVAILABLE",
						failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_REJECTED,
						providerStatusCode: providerResponse.response.status,
					} as const;
				}

				const providerOutput = await this._parseProviderOutput({
					response: providerResponse.response,
					schema: GooglePlacesDetailsOutputSchema,
				});
				if (providerOutput === null) {
					return {
						kind: "UNAVAILABLE",
						failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID,
						providerStatusCode: providerResponse.response.status,
					} as const;
				}

				return {
					kind: "SUCCESS",
					output: AddressDetailsOutputSchema.parse({
						latitude: providerOutput.location.latitude,
						longitude: providerOutput.location.longitude,
					}),
				} as const;
			},
			operation: GeosearchProviderOperation.ADDRESS_DETAILS,
			telemetryContext: params.telemetryContext,
		});
	}

	async searchAddresses(params: {
		apiKey: string;
		languageCode: string;
		query: string;
		sessionToken: string;
		telemetryContext: GeosearchTelemetryContext;
	}): Promise<
		| { kind: "SUCCESS"; output: z.infer<typeof AddressSearchOutputSchema> }
		| { kind: "TIMEOUT" }
		| GeosearchProviderUnavailableResult
	> {
		return this._getProviderResultWithLifecycleTelemetry({
			execute: async () => {
				const providerResponse = await this._fetchProvider({
					request: new Request("https://places.googleapis.com/v1/places:autocomplete", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Goog-Api-Key": params.apiKey,
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

				if (!providerResponse.response.ok) {
					return {
						kind: "UNAVAILABLE",
						failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_REJECTED,
						providerStatusCode: providerResponse.response.status,
					} as const;
				}

				const providerOutput = await this._parseProviderOutput({
					response: providerResponse.response,
					schema: GooglePlacesAutocompleteOutputSchema,
				});
				if (providerOutput === null) {
					return {
						kind: "UNAVAILABLE",
						failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID,
						providerStatusCode: providerResponse.response.status,
					} as const;
				}

				return {
					kind: "SUCCESS",
					output: AddressSearchOutputSchema.parse({
						suggestions: (providerOutput.suggestions ?? []).map(({ placePrediction }) => ({
							addressId: placePrediction.placeId,
							fullText: placePrediction.text.text,
							primaryText: placePrediction.structuredFormat.mainText.text,
							secondaryText: placePrediction.structuredFormat.secondaryText?.text ?? null,
							category: parseGooglePlacesAddressCategory({ placeTypes: placePrediction.types ?? [] }),
						})),
						attribution: this.attribution,
					}),
				} as const;
			},
			operation: GeosearchProviderOperation.ADDRESS_SEARCH,
			telemetryContext: params.telemetryContext,
		});
	}

	private async _getProviderResultWithLifecycleTelemetry<
		TResult extends {
			kind: "ADDRESS_NOT_FOUND" | "SUCCESS" | "TIMEOUT" | "UNAVAILABLE";
			failureReason?: GeosearchProviderFailureReason;
			providerStatusCode?: number;
		},
	>(params: {
		execute: () => Promise<TResult>;
		operation: GeosearchProviderOperation;
		telemetryContext: GeosearchTelemetryContext;
	}): Promise<TResult> {
		const operationStartedAt = performance.now();
		const lifecycleLogFields = {
			env: params.telemetryContext.environment,
			operation: params.operation,
			provider: "GOOGLE_PLACES",
			requestId: params.telemetryContext.requestId,
			service: getGeosearchServiceName({ environment: params.telemetryContext.environment }),
			version: params.telemetryContext.version,
		};

		try {
			const result = await params.execute();
			const completedLifecycleLogFields = {
				...lifecycleLogFields,
				durationMilliseconds: performance.now() - operationStartedAt,
				...(result.kind === "UNAVAILABLE"
					? {
							failureReason: result.failureReason,
							...(result.providerStatusCode === undefined ? {} : { providerStatusCode: result.providerStatusCode }),
						}
					: {}),
				outcome: result.kind,
			};

			switch (result.kind) {
				case "ADDRESS_NOT_FOUND":
				case "SUCCESS":
					console.log({
						...completedLifecycleLogFields,
						event: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_COMPLETED_EVENT,
					});
					break;
				case "TIMEOUT":
				case "UNAVAILABLE":
					console.error({
						...completedLifecycleLogFields,
						event: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_REJECTED_EVENT,
					});
					break;
			}

			return result;
		} catch (error: unknown) {
			console.error({
				...lifecycleLogFields,
				...getSourceSafeErrorTelemetryFields({ error: error }),
				durationMilliseconds: performance.now() - operationStartedAt,
				event: ObservabilityEventConstants.GEOSEARCH_PROVIDER_REQUEST_FAILED_EVENT,
				outcome: "THREW",
			});
			throw error;
		}
	}

	private async _fetchProvider(params: {
		request: Request;
	}): Promise<{ kind: "SUCCESS"; response: Response } | { kind: "TIMEOUT" } | GeosearchProviderUnavailableResult> {
		try {
			return { kind: "SUCCESS", response: await (this._fetchImplementation ?? fetch)(params.request) };
		} catch (error) {
			if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
				return { kind: "TIMEOUT" };
			}

			return {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.TRANSPORT_UNAVAILABLE,
			};
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
