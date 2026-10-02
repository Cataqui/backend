import { PlacesRepository } from "./places.repository";

describe("PlacesRepository", () => {
	let fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>;
	let repository: PlacesRepository;

	beforeEach(() => {
		fetchImplementation = vi.fn<typeof fetch>();
		repository = new PlacesRepository({
			apiKey: "google-places-key",
			searchRateLimiter: { limit: vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true }) },
			detailsRateLimiter: { limit: vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true }) },
			fetchImplementation: fetchImplementation,
		});
	});

	it.each(["search", "details"])(
		"should prevent API-key forwarding through %s provider redirects",
		async (operation) => {
			fetchImplementation.mockResolvedValue(
				new Response(null, { status: 302, headers: { Location: "https://other.test" } }),
			);

			const result =
				operation === "search"
					? await repository.searchPlaces({ languageCode: "pt-BR", query: "Place", sessionToken: "session" })
					: await repository.getPlaceDetails({ placeId: "place-id", sessionToken: "session" });
			const request = fetchImplementation.mock.calls[0]?.[0];
			if (!(request instanceof Request)) throw new Error("Expected a provider Request.");

			expect(request.redirect).toBe("manual");
			expect(result).toEqual({ kind: "UNAVAILABLE" });
		},
	);

	it.each(["search", "details"])("should cancel the rejected %s provider response body", async (operation) => {
		const cancel = vi.fn();
		fetchImplementation.mockResolvedValue(new Response(new ReadableStream({ cancel: cancel }), { status: 503 }));

		const result =
			operation === "search"
				? await repository.searchPlaces({ languageCode: "pt-BR", query: "Place", sessionToken: "session" })
				: await repository.getPlaceDetails({ placeId: "place-id", sessionToken: "session" });

		expect(result).toEqual({ kind: "UNAVAILABLE" });
		expect(cancel).toHaveBeenCalledOnce();
	});

	it("should preserve a missing-place result when discarding the provider body fails", async () => {
		const cancel = vi.fn().mockRejectedValue(new Error("stream cleanup failed"));
		fetchImplementation.mockResolvedValue(new Response(new ReadableStream({ cancel: cancel }), { status: 404 }));

		await expect(repository.getPlaceDetails({ placeId: "missing", sessionToken: "session" })).resolves.toEqual({
			kind: "PLACE_NOT_FOUND",
		});
		expect(cancel).toHaveBeenCalledOnce();
	});

	it("should request only normalized place suggestions inside São Paulo", async () => {
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

		const result = await repository.searchPlaces({
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
			result: {
				kind: "SUCCESS",
				output: {
					suggestions: [
						{
							placeId: "google-place-id",
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
			repository.searchPlaces({
				languageCode: "en-US",
				query: "Place",
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
							text: { text: "Place" },
							structuredFormat: { mainText: { text: "Place" } },
						},
					},
				],
			}),
		);

		const result = await repository.searchPlaces({
			languageCode: "en-US",
			query: "Place",
			sessionToken: "session",
		});

		expect(result.kind === "SUCCESS" ? result.output.suggestions[0] : undefined).toMatchObject({
			secondaryText: null,
			category: "OTHER",
		});
	});

	it("should request only coordinates with the terminating session token", async () => {
		fetchImplementation.mockResolvedValue(Response.json({ location: { latitude: -23.55, longitude: -46.63 } }));

		const result = await repository.getPlaceDetails({
			placeId: "place/id",
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
		{
			name: "malformed autocomplete types",
			response: Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "id",
							text: { text: "Place" },
							structuredFormat: { mainText: { text: "Place" } },
							types: [42],
						},
					},
				],
			}),
			operation: "search",
		},
		{ name: "malformed details fields", response: Response.json({ location: {} }), operation: "details" },
		{ name: "provider failure", response: Response.json({}, { status: 503 }), operation: "search" },
	])("should return unavailable for $name without exposing provider data", async ({ response, operation }) => {
		fetchImplementation.mockResolvedValue(response);

		const promise =
			operation === "search"
				? repository.searchPlaces({
						languageCode: "en-US",
						query: "Place",
						sessionToken: "session",
					})
				: repository.getPlaceDetails({
						placeId: "id",
						sessionToken: "session",
					});

		await expect(promise).resolves.toEqual({ kind: "UNAVAILABLE" });
	});

	it("should distinguish an place that Google does not find", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 404 }));

		await expect(
			repository.getPlaceDetails({
				placeId: "missing",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "PLACE_NOT_FOUND" });
	});

	it("should reject an unsuccessful place-details provider response", async () => {
		fetchImplementation.mockResolvedValue(Response.json({}, { status: 503 }));

		await expect(
			repository.getPlaceDetails({
				placeId: "place-id",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "UNAVAILABLE" });
	});

	it("should use a five-second timeout and translate timeout failures", async () => {
		const timeoutSignal = new AbortController().signal;
		const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
		fetchImplementation.mockRejectedValue(new DOMException("provider timeout", "TimeoutError"));

		await expect(
			repository.searchPlaces({
				languageCode: "en-US",
				query: "Place",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "TIMEOUT" });
		expect(timeout).toHaveBeenCalledWith(5_000);
	});

	it("should translate an aborted place-details request as a timeout", async () => {
		fetchImplementation.mockRejectedValue(new DOMException("provider aborted", "AbortError"));

		await expect(
			repository.getPlaceDetails({
				placeId: "place-id",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "TIMEOUT" });
	});

	it.each(["TimeoutError", "AbortError"])(
		"should preserve %s while reading a provider response body as a timeout",
		async (errorName) => {
			fetchImplementation.mockResolvedValue(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new DOMException("provider body timed out", errorName));
						},
					}),
				),
			);

			await expect(
				repository.getPlaceDetails({
					placeId: "place-id",
					sessionToken: "session",
				}),
			).resolves.toEqual({ kind: "TIMEOUT" });
		},
	);

	it("should translate an unexpected provider transport failure as unavailable", async () => {
		fetchImplementation.mockRejectedValue(new TypeError("network unavailable"));

		await expect(
			repository.searchPlaces({
				languageCode: "en-US",
				query: "Place",
				sessionToken: "session",
			}),
		).resolves.toEqual({ kind: "UNAVAILABLE" });
	});
});
