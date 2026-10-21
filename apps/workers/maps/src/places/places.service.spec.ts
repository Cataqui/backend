import { PlaceCategory } from "@cataqui/places";
import * as td from "testdouble";
import { PlaceDetailsRateLimitedError } from "./errors/place-details-rate-limited.error";
import { PlaceNotFoundError } from "./errors/place-not-found.error";
import { PlaceProviderResponseInvalidError } from "./errors/place-provider-response-invalid.error";
import { PlaceProviderTimeoutError } from "./errors/place-provider-timeout.error";
import { PlaceProviderUnavailableError } from "./errors/place-provider-unavailable.error";
import { PlaceSearchRateLimitedError } from "./errors/place-search-rate-limited.error";
import type { PlacesRepository } from "./places.repository";
import { PlacesService } from "./places.service";

afterEach(() => td.reset());

describe("PlacesService", () => {
	let repository: PlacesRepository;
	let service: PlacesService;

	beforeEach(() => {
		repository = td.object<PlacesRepository>();
		td.when(repository.consumeSearchRateLimit(td.matchers.anything())).thenResolve({ success: true });
		td.when(repository.consumeDetailsRateLimit(td.matchers.anything())).thenResolve({ success: true });
		service = new PlacesService(repository);
	});

	it("returns an attributed blank search without consuming rate-limit capacity", async () => {
		await expect(
			service.searchPlaces({
				input: { query: "", sessionToken: "session" },
				languageCode: "pt-BR",
				rateLimitKey: "key",
			}),
		).resolves.toEqual({ suggestions: [], attribution: { text: "Google Maps" } });
		expect(td.explain(repository.consumeSearchRateLimit).callCount).toBe(0);
		expect(td.explain(repository.searchPlaces).callCount).toBe(0);
	});

	it.each(["search", "details"])("enforces the %s limit before accessing the provider", async (operation) => {
		const consumeRateLimit =
			operation === "search" ? repository.consumeSearchRateLimit : repository.consumeDetailsRateLimit;
		td.when(consumeRateLimit({ key: "key" })).thenResolve({ success: false });
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "pt-BR",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "place-id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toMatchObject(
			operation === "search" ? new PlaceSearchRateLimitedError() : new PlaceDetailsRateLimitedError(),
		);
		expect(td.explain(repository.searchPlaces).callCount).toBe(0);
		expect(td.explain(repository.getPlaceDetails).callCount).toBe(0);
	});

	it.each(["search", "details"])("preserves %s rate-limit storage failures", async (operation) => {
		const consumeRateLimit =
			operation === "search" ? repository.consumeSearchRateLimit : repository.consumeDetailsRateLimit;
		const failure = new Error("rate-limit storage is unavailable");
		td.when(consumeRateLimit({ key: "key" })).thenReject(failure);
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "pt-BR",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "place-id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toBe(failure);
		expect(td.explain(repository.searchPlaces).callCount).toBe(0);
		expect(td.explain(repository.getPlaceDetails).callCount).toBe(0);
	});

	it("validates and normalizes suggestions through the category contract", async () => {
		const fromGoogle = td.replace(PlaceCategory, "fromGoogle");
		td.when(fromGoogle({ types: ["route"] })).thenReturn(PlaceCategory.STREET);
		td.when(fromGoogle({ types: [] })).thenReturn(PlaceCategory.OTHER);
		td.when(repository.searchPlaces(td.matchers.anything())).thenResolve(
			Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "google-place-id",
							text: { text: "Avenida Paulista, São Paulo" },
							structuredFormat: { mainText: { text: "Avenida Paulista" }, secondaryText: { text: "São Paulo" } },
							types: ["route"],
						},
					},
					{
						placePrediction: {
							placeId: "other-place-id",
							text: { text: "Place" },
							structuredFormat: { mainText: { text: "Place" } },
						},
					},
				],
			}),
		);
		await expect(
			service.searchPlaces({
				input: { query: "Avenida Paulista", sessionToken: "frontend-session" },
				languageCode: "pt-BR",
				rateLimitKey: "key",
			}),
		).resolves.toEqual({
			suggestions: [
				{
					placeId: "google-place-id",
					fullText: "Avenida Paulista, São Paulo",
					primaryText: "Avenida Paulista",
					secondaryText: "São Paulo",
					category: PlaceCategory.STREET,
				},
				{
					placeId: "other-place-id",
					fullText: "Place",
					primaryText: "Place",
					secondaryText: null,
					category: PlaceCategory.OTHER,
				},
			],
			attribution: { text: "Google Maps" },
		});
		td.verify(fromGoogle({ types: ["route"] }));
		td.verify(fromGoogle({ types: [] }));
		td.verify(repository.consumeSearchRateLimit({ key: "key" }));
		td.verify(
			repository.searchPlaces({
				query: "Avenida Paulista",
				sessionToken: "frontend-session",
				languageCode: "pt-BR",
				signal: td.matchers.isA(AbortSignal),
			}),
		);
	});

	it("treats omitted suggestions as an empty search result", async () => {
		td.when(repository.searchPlaces(td.matchers.anything())).thenResolve(Response.json({}));
		await expect(
			service.searchPlaces({
				input: { query: "Place", sessionToken: "session" },
				languageCode: "en-US",
				rateLimitKey: "key",
			}),
		).resolves.toEqual({ suggestions: [], attribution: { text: "Google Maps" } });
	});

	it("validates and maps coordinates from a permitted details response", async () => {
		td.when(repository.getPlaceDetails(td.matchers.anything())).thenResolve(
			Response.json({ location: { latitude: -23.55, longitude: -46.63 } }),
		);
		await expect(
			service.getPlaceDetails({ input: { placeId: "place-id", sessionToken: "session" }, rateLimitKey: "key" }),
		).resolves.toEqual({ latitude: -23.55, longitude: -46.63 });
		td.verify(repository.consumeDetailsRateLimit({ key: "key" }));
		td.verify(
			repository.getPlaceDetails({
				placeId: "place-id",
				sessionToken: "session",
				signal: td.matchers.isA(AbortSignal),
			}),
		);
	});

	it.each(["search", "details"])("owns the five-second %s deadline", async (operation) => {
		const timeoutSignal = new AbortController().signal;
		const timeout = td.replace(AbortSignal, "timeout");
		td.when(timeout(5_000)).thenReturn(timeoutSignal);
		td.when(repository.searchPlaces(td.matchers.anything())).thenResolve(Response.json({}));
		td.when(repository.getPlaceDetails(td.matchers.anything())).thenResolve(
			Response.json({ location: { latitude: -23.55, longitude: -46.63 } }),
		);
		if (operation === "search") {
			await service.searchPlaces({
				input: { query: "Place", sessionToken: "session" },
				languageCode: "en-US",
				rateLimitKey: "key",
			});
		} else {
			await service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		}
		expect(td.explain(timeout).calls.map((call) => call.args)).toEqual([[5_000]]);
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		expect(td.explain(providerCall).calls[0]?.args[0]).toMatchObject({ signal: timeoutSignal });
	});

	it.each(["search", "details"])("interprets unsuccessful %s provider statuses", async (operation) => {
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		td.when(providerCall(td.matchers.anything())).thenResolve(new Response(null, { status: 503 }));
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "en-US",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toMatchObject(new PlaceProviderUnavailableError());
	});

	it("distinguishes a place that the provider does not find", async () => {
		td.when(repository.getPlaceDetails(td.matchers.anything())).thenResolve(new Response(null, { status: 404 }));
		await expect(
			service.getPlaceDetails({ input: { placeId: "missing", sessionToken: "session" }, rateLimitKey: "key" }),
		).rejects.toMatchObject(new PlaceNotFoundError());
	});

	it.each([
		{ operation: "search", response: new Response("not-json") },
		{ operation: "search", response: Response.json({ suggestions: [{ placePrediction: { types: [42] } }] }) },
		{ operation: "details", response: new Response("not-json") },
		{ operation: "details", response: Response.json({ location: { latitude: 91, longitude: 0 } }) },
	])("identifies malformed $operation provider output", async ({ operation, response }) => {
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		td.when(providerCall(td.matchers.anything())).thenResolve(response);
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "en-US",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toMatchObject(new PlaceProviderResponseInvalidError());
	});

	it.each(["search", "details"])("translates %s transport failures", async (operation) => {
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		td.when(providerCall(td.matchers.anything())).thenReject(new TypeError("private network diagnostics"));
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "en-US",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toMatchObject(new PlaceProviderUnavailableError());
	});

	it.each(["search", "details"])("preserves known %s provider failures", async (operation) => {
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		const failure = new PlaceProviderUnavailableError();
		td.when(providerCall(td.matchers.anything())).thenReject(failure);
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "en-US",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toBe(failure);
	});

	it.each([
		{ operation: "search", failureAt: "fetch", errorName: "TimeoutError" },
		{ operation: "details", failureAt: "fetch", errorName: "AbortError" },
		{ operation: "search", failureAt: "body", errorName: "AbortError" },
		{ operation: "details", failureAt: "body", errorName: "TimeoutError" },
	])("preserves $operation $failureAt $errorName as a timeout", async ({ operation, failureAt, errorName }) => {
		const providerCall = operation === "search" ? repository.searchPlaces : repository.getPlaceDetails;
		const failure = new DOMException("private timeout diagnostics", errorName);
		if (failureAt === "fetch") {
			td.when(providerCall(td.matchers.anything())).thenReject(failure);
		} else {
			td.when(providerCall(td.matchers.anything())).thenResolve(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.error(failure);
						},
					}),
				),
			);
		}
		const promise =
			operation === "search"
				? service.searchPlaces({
						input: { query: "Place", sessionToken: "session" },
						languageCode: "en-US",
						rateLimitKey: "key",
					})
				: service.getPlaceDetails({ input: { placeId: "id", sessionToken: "session" }, rateLimitKey: "key" });
		await expect(promise).rejects.toMatchObject(new PlaceProviderTimeoutError());
	});
});
