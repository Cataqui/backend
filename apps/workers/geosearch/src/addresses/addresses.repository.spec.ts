import { AddressesRepository } from "./addresses.repository";

describe("AddressesRepository", () => {
	let fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>;
	let repository: AddressesRepository;

	beforeEach(() => {
		fetchImplementation = vi.fn<typeof fetch>();
		repository = new AddressesRepository({ fetchImplementation: fetchImplementation });
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
		});
		const request = fetchImplementation.mock.calls[0]?.[0] as Request;

		expect({
			url: request.url,
			method: request.method,
			apiKey: request.headers.get("X-Goog-Api-Key"),
			fieldMask: request.headers.get("X-Goog-FieldMask"),
			body: await request.json(),
			result: result,
		}).toEqual({
			url: "https://places.googleapis.com/v1/places:autocomplete",
			method: "POST",
			apiKey: "google-places-key",
			fieldMask:
				"suggestions.placePrediction.placeId,suggestions.placePrediction.text.text," +
				"suggestions.placePrediction.structuredFormat.mainText.text," +
				"suggestions.placePrediction.structuredFormat.secondaryText.text",
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
			result: {
				kind: "SUCCESS",
				output: {
					suggestions: [
						{
							addressId: "google-place-id",
							fullText: "Avenida Paulista, São Paulo",
							primaryText: "Avenida Paulista",
							secondaryText: "São Paulo",
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
		});

		expect(result.kind === "SUCCESS" ? result.output.suggestions[0]?.secondaryText : undefined).toBeNull();
	});

	it("should request only coordinates with the terminating session token", async () => {
		fetchImplementation.mockResolvedValue(Response.json({ location: { latitude: -23.55, longitude: -46.63 } }));

		const result = await repository.getAddressDetails({
			addressId: "place/id",
			apiKey: "google-places-key",
			sessionToken: "frontend-session",
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
		{ name: "malformed autocomplete JSON", response: new Response("not-json"), operation: "search" },
		{ name: "malformed details fields", response: Response.json({ location: {} }), operation: "details" },
		{ name: "provider failure", response: Response.json({}, { status: 503 }), operation: "search" },
	])("should return unavailable for $name without exposing provider data", async ({ response, operation }) => {
		fetchImplementation.mockResolvedValue(response);

		const promise =
			operation === "search"
				? repository.searchAddresses({
						apiKey: "google-places-key",
						languageCode: "en-US",
						query: "Address",
						sessionToken: "session",
					})
				: repository.getAddressDetails({
						addressId: "id",
						apiKey: "google-places-key",
						sessionToken: "session",
					});

		await expect(promise).resolves.toEqual({ kind: "UNAVAILABLE" });
	});

	it("should distinguish an address that Google does not find", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 404 }));

		await expect(
			repository.getAddressDetails({
				addressId: "missing",
				apiKey: "google-places-key",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "ADDRESS_NOT_FOUND" });
	});

	it("should reject an unsuccessful address-details provider response", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 503 }));

		await expect(
			repository.getAddressDetails({
				addressId: "address-id",
				apiKey: "google-places-key",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "UNAVAILABLE" });
	});

	it("should use a five-second timeout and translate timeout failures", async () => {
		const timeoutSignal = new AbortController().signal;
		const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
		fetchImplementation.mockRejectedValue(new DOMException("provider timeout", "TimeoutError"));

		await expect(
			repository.searchAddresses({
				apiKey: "google-places-key",
				languageCode: "en-US",
				query: "Address",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "TIMEOUT" });
		expect(timeout).toHaveBeenCalledWith(5_000);
	});

	it("should translate an aborted address-details request as a timeout", async () => {
		fetchImplementation.mockRejectedValue(new DOMException("provider aborted", "AbortError"));

		await expect(
			repository.getAddressDetails({
				addressId: "address-id",
				apiKey: "google-places-key",
				sessionToken: "session",
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
			}),
		).resolves.toEqual({ kind: "UNAVAILABLE" });
	});
});
