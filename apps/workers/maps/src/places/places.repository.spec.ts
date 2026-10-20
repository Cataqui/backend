import * as td from "testdouble";
import { PlacesRepository } from "./places.repository";

afterEach(() => td.reset());

describe("PlacesRepository", () => {
	let repository: PlacesRepository;
	let searchRateLimiter: RateLimit;
	let detailsRateLimiter: RateLimit;

	beforeEach(() => {
		searchRateLimiter = td.object<RateLimit>();
		detailsRateLimiter = td.object<RateLimit>();
		repository = new PlacesRepository(
			{ googlePlacesApiKey: "google-places-key" },
			searchRateLimiter,
			detailsRateLimiter,
		);
	});

	it.each([
		{ operation: "search", success: true },
		{ operation: "search", success: false },
		{ operation: "details", success: true },
		{ operation: "details", success: false },
	])("returns the raw $success outcome from the $operation limiter", async ({ operation, success }) => {
		const limiter = operation === "search" ? searchRateLimiter : detailsRateLimiter;
		const outcome = { success: success } satisfies RateLimitOutcome;
		td.when(limiter.limit({ key: "development:user-id" })).thenResolve(outcome);
		const result =
			operation === "search"
				? await repository.consumeSearchRateLimit({ key: "development:user-id" })
				: await repository.consumeDetailsRateLimit({ key: "development:user-id" });
		expect(result).toBe(outcome);
		td.verify(limiter.limit({ key: "development:user-id" }));
	});

	it("requests only autocomplete fields inside São Paulo and returns the raw response", async () => {
		const providerFetch = td.replace(globalThis, "fetch");
		const response = Response.json({ suggestions: [] });
		td.when(providerFetch(td.matchers.anything())).thenResolve(response);
		const controller = new AbortController();
		await expect(
			repository.searchPlaces({
				languageCode: "pt-BR",
				query: "Avenida Paulista",
				sessionToken: "frontend-session",
				signal: controller.signal,
			}),
		).resolves.toBe(response);
		const request = td.explain(providerFetch).calls[0]?.args[0];
		if (!(request instanceof Request)) throw new Error("Expected a provider Request.");
		expect({
			url: request.url,
			method: request.method,
			redirect: request.redirect,
			apiKey: request.headers.get("X-Goog-Api-Key"),
			contentType: request.headers.get("Content-Type"),
			fieldMask: request.headers.get("X-Goog-FieldMask"),
			body: await request.json(),
		}).toEqual({
			url: "https://places.googleapis.com/v1/places:autocomplete",
			method: "POST",
			redirect: "manual",
			apiKey: "google-places-key",
			contentType: "application/json",
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
		});
		controller.abort();
		expect(request.signal.aborted).toBe(true);
	});

	it("requests only coordinates with the terminating session token", async () => {
		const providerFetch = td.replace(globalThis, "fetch");
		const response = Response.json({ location: { latitude: -23.55, longitude: -46.63 } });
		td.when(providerFetch(td.matchers.anything())).thenResolve(response);
		const controller = new AbortController();
		await expect(
			repository.getPlaceDetails({ placeId: "place/id", sessionToken: "frontend-session", signal: controller.signal }),
		).resolves.toBe(response);
		const request = td.explain(providerFetch).calls[0]?.args[0];
		if (!(request instanceof Request)) throw new Error("Expected a provider Request.");
		expect({
			url: request.url,
			method: request.method,
			redirect: request.redirect,
			apiKey: request.headers.get("X-Goog-Api-Key"),
			fieldMask: request.headers.get("X-Goog-FieldMask"),
		}).toEqual({
			url: "https://places.googleapis.com/v1/places/place%2Fid?sessionToken=frontend-session",
			method: "GET",
			redirect: "manual",
			apiKey: "google-places-key",
			fieldMask: "location",
		});
		controller.abort();
		expect(request.signal.aborted).toBe(true);
	});

	it.each([302, 404, 503])("discards the unused %s body and preserves the raw status", async (status) => {
		const providerFetch = td.replace(globalThis, "fetch");
		const cancel = td.func<(reason: unknown) => void>();
		const response = new Response(new ReadableStream({ cancel: cancel }), { status: status });
		td.when(providerFetch(td.matchers.anything())).thenResolve(response);
		await expect(
			repository.getPlaceDetails({ placeId: "id", sessionToken: "session", signal: new AbortController().signal }),
		).resolves.toBe(response);
		expect(td.explain(cancel).callCount).toBe(1);
	});

	it.each(["rejected", "pending"])("does not let %s cleanup hide the provider status", async (cleanup) => {
		const providerFetch = td.replace(globalThis, "fetch");
		const cancel = td.func<(reason: unknown) => Promise<void>>();
		if (cleanup === "rejected") {
			td.when(cancel(td.matchers.anything())).thenReject(new Error("private cleanup failure"));
		} else {
			td.when(cancel(td.matchers.anything())).thenReturn(new Promise<void>(() => undefined));
		}
		const response = new Response(new ReadableStream({ cancel: cancel }), { status: 404 });
		td.when(providerFetch(td.matchers.anything())).thenResolve(response);
		await expect(
			repository.getPlaceDetails({ placeId: "id", sessionToken: "session", signal: new AbortController().signal }),
		).resolves.toBe(response);
	});

	it("preserves provider errors for the service", async () => {
		const providerFetch = td.replace(globalThis, "fetch");
		const failure = new DOMException("provider timeout", "TimeoutError");
		td.when(providerFetch(td.matchers.anything())).thenReject(failure);
		await expect(
			repository.searchPlaces({
				languageCode: "en-US",
				query: "Place",
				sessionToken: "session",
				signal: new AbortController().signal,
			}),
		).rejects.toBe(failure);
	});
});
