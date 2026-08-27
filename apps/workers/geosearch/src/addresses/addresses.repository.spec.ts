import { AddressesRepository } from "./addresses.repository";
import { GeosearchProviderFailureReason, type GeosearchTelemetryContext } from "../shared/geosearch-telemetry";

const telemetryContext = {
	environment: "development",
	requestId: "repository-spec-request",
	version: "repository-spec-version",
} satisfies GeosearchTelemetryContext;

describe("AddressesRepository", () => {
	let fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>;
	let repository: AddressesRepository;

	beforeEach(() => {
		fetchImplementation = vi.fn<typeof fetch>();
		repository = new AddressesRepository({ fetchImplementation: fetchImplementation });
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should request only normalized address suggestions inside São Paulo", async () => {
		fetchImplementation.mockResolvedValue(
			Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "google-place-id",
							text: { text: "Avenida Paulista, São Paulo" },
							structuredFormat: {
								mainText: { text: "Avenida Paulista" },
								secondaryText: { text: "São Paulo" },
							},
							types: ["route"],
						},
					},
				],
			}),
		);

		const result = await repository.searchAddresses({
			apiKey: "google-places-key",
			languageCode: "pt-BR",
			query: "Avenida Paulista",
			sessionToken: "frontend-session",
			telemetryContext: telemetryContext,
		});
		const request = fetchImplementation.mock.calls[0]?.[0] as Request;

		expect({
			url: request.url,
			method: request.method,
			apiKey: request.headers.get("X-Goog-Api-Key"),
			fieldMask: request.headers.get("X-Goog-FieldMask"),
			body: await request.json(),
			providerLog: vi.mocked(console.log).mock.calls[0]?.[0],
			result: result,
		}).toEqual({
			url: "https://places.googleapis.com/v1/places:autocomplete",
			method: "POST",
			apiKey: "google-places-key",
			fieldMask:
				"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text," +
				"suggestions.placePrediction.structuredFormat.mainText.text," +
				"suggestions.placePrediction.structuredFormat.secondaryText.text," +
				"suggestions.placePrediction.types",
			body: {
				input: "Avenida Paulista",
				languageCode: "pt-BR",
				regionCode: "br",
				includedRegionCodes: ["br"],
				includeQueryPredictions: false,
				sessionToken: "frontend-session",
				locationRestriction: {
					rectangle: {
						low: { latitude: -24.0016, longitude: -46.8233 },
						high: { latitude: -23.3633, longitude: -46.3664 },
					},
				},
			},
			providerLog: {
				durationMilliseconds: expect.any(Number),
				env: "development",
				event: "geosearch.provider.request.completed",
				operation: "ADDRESS_SEARCH",
				outcome: "SUCCESS",
				provider: "GOOGLE_PLACES",
				requestId: "repository-spec-request",
				service: "cataqui-geosearch-development",
				version: "repository-spec-version",
			},
			result: {
				kind: "SUCCESS",
				output: {
					suggestions: [
						{
							addressId: "google-place-id",
							fullText: "Avenida Paulista, São Paulo",
							primaryText: "Avenida Paulista",
							secondaryText: "São Paulo",
							category: "STREET",
						},
					],
					attribution: { text: "Google Maps" },
				},
			},
		});
	});

	it("should treat omitted suggestions as empty", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}));

		await expect(
			repository.searchAddresses({
				apiKey: "google-places-key",
				languageCode: "en-US",
				query: "Address",
				sessionToken: "session",
				telemetryContext: telemetryContext,
			}),
		).resolves.toEqual({
			kind: "SUCCESS",
			output: { suggestions: [], attribution: { text: "Google Maps" } },
		});
	});

	it("should preserve nullable secondary text", async () => {
		fetchImplementation.mockResolvedValue(
			Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "id",
							text: { text: "Address" },
							structuredFormat: { mainText: { text: "Address" } },
						},
					},
				],
			}),
		);

		const result = await repository.searchAddresses({
			apiKey: "google-places-key",
			languageCode: "en-US",
			query: "Address",
			sessionToken: "session",
			telemetryContext: telemetryContext,
		});

		expect(result.kind === "SUCCESS" ? result.output.suggestions[0] : undefined).toMatchObject({
			secondaryText: null,
			category: "OTHER",
		});
	});

	it("should request only coordinates with the terminating session token", async () => {
		fetchImplementation.mockResolvedValue(Response.json({ location: { latitude: -23.55, longitude: -46.63 } }));

		const result = await repository.getAddressDetails({
			addressId: "place/id",
			apiKey: "google-places-key",
			sessionToken: "frontend-session",
			telemetryContext: telemetryContext,
		});
		const request = fetchImplementation.mock.calls[0]?.[0] as Request;

		expect({
			url: request.url,
			method: request.method,
			apiKey: request.headers.get("X-Goog-Api-Key"),
			fieldMask: request.headers.get("X-Goog-FieldMask"),
			result: result,
		}).toEqual({
			url: "https://places.googleapis.com/v1/places/place%2Fid?sessionToken=frontend-session",
			method: "GET",
			apiKey: "google-places-key",
			fieldMask: "location",
			result: { kind: "SUCCESS", output: { latitude: -23.55, longitude: -46.63 } },
		});
	});

	it.each([
		{
			name: "malformed autocomplete JSON",
			response: new Response("not-json"),
			operation: "search",
			expectedResult: {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID,
				providerStatusCode: 200,
			},
		},
		{
			name: "malformed autocomplete types",
			response: Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "id",
							text: { text: "Address" },
							structuredFormat: { mainText: { text: "Address" } },
							types: [42],
						},
					},
				],
			}),
			operation: "search",
			expectedResult: {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID,
				providerStatusCode: 200,
			},
		},
		{
			name: "malformed details fields",
			response: Response.json({ location: {} }),
			operation: "details",
			expectedResult: {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_INVALID,
				providerStatusCode: 200,
			},
		},
		{
			name: "provider failure",
			response: Response.json({}, { status: 503 }),
			operation: "search",
			expectedResult: {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_REJECTED,
				providerStatusCode: 503,
			},
		},
	])(
		"should return unavailable for $name without exposing provider data",
		async ({ expectedResult, response, operation }) => {
			fetchImplementation.mockResolvedValue(response);

			const promise =
				operation === "search"
					? repository.searchAddresses({
							apiKey: "google-places-key",
							languageCode: "en-US",
							query: "Address",
							sessionToken: "session",
							telemetryContext: telemetryContext,
						})
					: repository.getAddressDetails({
							addressId: "id",
							apiKey: "google-places-key",
							sessionToken: "session",
							telemetryContext: telemetryContext,
						});

			await expect(promise).resolves.toEqual(expectedResult);
		},
	);

	it("should distinguish an address that Google does not find", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 404 }));

		await expect(
			repository.getAddressDetails({
				addressId: "missing",
				apiKey: "google-places-key",
				sessionToken: "session",
				telemetryContext: telemetryContext,
			}),
		).resolves.toEqual({ kind: "ADDRESS_NOT_FOUND" });
	});

	it("should reject an unsuccessful address-details provider response", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 503 }));

		const result = await repository.getAddressDetails({
			addressId: "address-id",
			apiKey: "google-places-key",
			sessionToken: "session",
			telemetryContext: telemetryContext,
		});

		expect({ result: result, providerLog: vi.mocked(console.error).mock.calls[0]?.[0] }).toEqual({
			result: {
				kind: "UNAVAILABLE",
				failureReason: GeosearchProviderFailureReason.PROVIDER_RESPONSE_REJECTED,
				providerStatusCode: 503,
			},
			providerLog: expect.objectContaining({
				event: "geosearch.provider.request.rejected",
				failureReason: "PROVIDER_RESPONSE_REJECTED",
				operation: "ADDRESS_DETAILS",
				providerStatusCode: 503,
			}),
		});
	});

	it("should use a five-second timeout and translate timeout failures", async () => {
		const timeoutSignal = new AbortController().signal;
		const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
		fetchImplementation.mockRejectedValue(new DOMException("provider timeout", "TimeoutError"));

		const result = await repository.searchAddresses({
			apiKey: "google-places-key",
			languageCode: "en-US",
			query: "Address",
			sessionToken: "session",
			telemetryContext: telemetryContext,
		});

		expect({
			result: result,
			timeoutCalls: timeout.mock.calls,
			providerLog: vi.mocked(console.error).mock.calls[0]?.[0],
		}).toEqual({
			result: { kind: "TIMEOUT" },
			timeoutCalls: [[5_000]],
			providerLog: {
				durationMilliseconds: expect.any(Number),
				env: "development",
				event: "geosearch.provider.request.rejected",
				operation: "ADDRESS_SEARCH",
				outcome: "TIMEOUT",
				provider: "GOOGLE_PLACES",
				requestId: "repository-spec-request",
				service: "cataqui-geosearch-development",
				version: "repository-spec-version",
			},
		});
	});

	it("should translate an aborted address-details request as a timeout", async () => {
		fetchImplementation.mockRejectedValue(new DOMException("provider aborted", "AbortError"));

		await expect(
			repository.getAddressDetails({
				addressId: "address-id",
				apiKey: "google-places-key",
				sessionToken: "session",
				telemetryContext: telemetryContext,
			}),
		).resolves.toEqual({ kind: "TIMEOUT" });
	});

	it("should translate an unexpected provider transport failure as unavailable", async () => {
		fetchImplementation.mockRejectedValue(new TypeError("network unavailable"));

		await expect(
			repository.searchAddresses({
				apiKey: "google-places-key",
				languageCode: "en-US",
				query: "Address",
				sessionToken: "session",
				telemetryContext: telemetryContext,
			}),
		).resolves.toEqual({
			kind: "UNAVAILABLE",
			failureReason: GeosearchProviderFailureReason.TRANSPORT_UNAVAILABLE,
		});
	});

	it("should log a safe failed provider lifecycle when response handling unexpectedly throws", async () => {
		const providerResponse = new Response();
		Object.defineProperty(providerResponse, "ok", {
			get: () => {
				throw new Error("private provider response failure");
			},
		});
		fetchImplementation.mockResolvedValue(providerResponse);
		let thrownError: unknown;

		try {
			await repository.searchAddresses({
				apiKey: "google-places-key",
				languageCode: "en-US",
				query: "Address",
				sessionToken: "session",
				telemetryContext: telemetryContext,
			});
		} catch (error: unknown) {
			thrownError = error;
		}

		const serializedLogs = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect({
			thrownErrorName: thrownError instanceof Error ? thrownError.name : undefined,
			providerLog: vi.mocked(console.error).mock.calls[0]?.[0],
			leaksProviderMessage: serializedLogs.includes("private provider response failure"),
		}).toEqual({
			thrownErrorName: "Error",
			providerLog: {
				durationMilliseconds: expect.any(Number),
				env: "development",
				errorName: "Error",
				errorStackFrames: expect.stringContaining("addresses.repository.spec.ts"),
				event: "geosearch.provider.request.failed",
				operation: "ADDRESS_SEARCH",
				outcome: "THREW",
				provider: "GOOGLE_PLACES",
				requestId: "repository-spec-request",
				service: "cataqui-geosearch-development",
				version: "repository-spec-version",
			},
			leaksProviderMessage: false,
		});
	});
});
