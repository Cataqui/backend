import { MapsErrorCode } from "../../shared/maps-error-code.enum";
import { PlaceCategory } from "./place-category";
import { PlacesRepository } from "./places.repository";

describe("PlacesRepository", () => {
	let fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>;
	let repository: PlacesRepository;

	beforeEach(() => {
		fetchImplementation = vi.fn<typeof fetch>();
		repository = new PlacesRepository({
			placesConfig: { googlePlacesApiKey: "google-places-key", geoapifyApiKey: "test-geoapify" },
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

	it("returns the ZOO category for Google zoo search suggestions", async () => {
		fetchImplementation.mockResolvedValue(
			Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "zoo-id",
							text: { text: "Jardim Zoológico de São Paulo" },
							structuredFormat: { mainText: { text: "Jardim Zoológico de São Paulo" } },
							types: ["tourist_attraction", "zoo"],
						},
					},
				],
			}),
		);
		const result = await repository.searchPlaces({
			languageCode: "pt-BR",
			query: "Zoológico",
			sessionToken: "session",
		});
		expect(result.kind === "SUCCESS" ? result.output.suggestions[0]?.category : undefined).toBe(PlaceCategory.ZOO);
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

describe("places in bounds", () => {
	const _bounds = { north: -23.5, south: -23.6, east: -46.6, west: -46.7 };

	function _feature(properties: Record<string, unknown> & { datasource?: { raw?: Record<string, unknown> } }) {
		return {
			type: "Feature",
			properties: {
				lat: -23.55,
				lon: -46.65,
				...properties,
				datasource: { raw: { name: properties["name"], ...properties.datasource?.raw } },
			},
		};
	}

	async function _findWith(features: unknown[]) {
		vi.stubGlobal(
			"fetch",
			vi.fn<typeof fetch>().mockImplementation(async (input) => {
				const categories = new URL(String(input)).searchParams.get("categories");
				return Response.json({ features: categories?.startsWith("airport") ? features : [] });
			}),
		);
		return new PlacesRepository({
			placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
			searchRateLimiter: { limit: vi.fn() },
			detailsRateLimiter: { limit: vi.fn() },
		}).searchPlacesInArea({
			bounds: _bounds,
			categories: [PlaceCategory.AIRPORT],
			limit: 60,
		});
	}

	async function _placeFromProvider(params: { feature: unknown }) {
		const [place] = await _findWith([params.feature]);
		return place;
	}

	afterEach(() => vi.unstubAllGlobals());

	describe("Geoapify place lookup", () => {
		it("loads a cathedral from the dedicated worship query with its notability signal", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn<typeof fetch>().mockImplementation(async (input) => {
					const categories = new URL(String(input)).searchParams.get("categories");
					return Response.json({
						features: categories?.startsWith("religion.place_of_worship")
							? [
									_feature({
										name: "Catedral da Sé",
										categories: ["tourism.sights", "tourism.sights.place_of_worship.cathedral"],
										datasource: { raw: { wikidata: "Q1" } },
									}),
								]
							: [],
					});
				}),
			);
			const places = await new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}).searchPlacesInArea({
				bounds: _bounds,
				categories: [PlaceCategory.PLACE_OF_WORSHIP],
				limit: 60,
			});
			expect(places).toEqual([
				{
					name: "Catedral da Sé",
					category: PlaceCategory.PLACE_OF_WORSHIP,
					coordinates: { latitude: -23.55, longitude: -46.65 },
					notable: true,
				},
			]);
		});

		it("requests caller-selected categories and limit inside the supplied bounds", async () => {
			const provider = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ features: [] }));
			vi.stubGlobal("fetch", provider);
			await new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}).searchPlacesInArea({
				bounds: _bounds,
				categories: [PlaceCategory.AIRPORT, PlaceCategory.TRAIN_STATION],
				limit: 42,
			});
			expect(provider).toHaveBeenCalledOnce();
			const request = Object.fromEntries(new URL(String(provider.mock.calls[0]![0])).searchParams);
			expect(request).toEqual({
				categories: "airport,public_transport.subway,public_transport.train",
				filter: "rect:-46.7,-23.5,-46.6,-23.6",
				limit: "42",
				apiKey: "test-key",
			});
		});

		it("returns normalized landmarks and skips invalid provider features", async () => {
			const places = await _findWith([
				_feature({ name: "Aeroporto de Congonhas", categories: ["airport"], datasource: { raw: { wikidata: "Q1" } } }),
				_feature({ name: "Sem coordenadas", categories: ["sport.stadium"], lat: "invalid" }),
			]);
			expect(places).toEqual([
				{
					name: "Aeroporto de Congonhas",
					category: PlaceCategory.AIRPORT,
					coordinates: { latitude: -23.55, longitude: -46.65 },
					notable: true,
				},
			]);
		});

		it("reports a provider error status as an unavailable provider", async () => {
			vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 503 })));
			await expect(
				new PlacesRepository({
					placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
					searchRateLimiter: { limit: vi.fn() },
					detailsRateLimiter: { limit: vi.fn() },
				}).searchPlacesInArea({
					bounds: _bounds,
					categories: [PlaceCategory.AIRPORT],
					limit: 60,
				}),
			).rejects.toMatchObject({
				errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			});
		});

		it("reports a response without features as an unavailable provider", async () => {
			vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("not json")));
			await expect(
				new PlacesRepository({
					placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
					searchRateLimiter: { limit: vi.fn() },
					detailsRateLimiter: { limit: vi.fn() },
				}).searchPlacesInArea({
					bounds: _bounds,
					categories: [PlaceCategory.AIRPORT],
					limit: 60,
				}),
			).rejects.toMatchObject({
				errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			});
		});

		it("reports a timed-out request as a provider timeout", async () => {
			vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("slow", "TimeoutError")));
			await expect(
				new PlacesRepository({
					placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
					searchRateLimiter: { limit: vi.fn() },
					detailsRateLimiter: { limit: vi.fn() },
				}).searchPlacesInArea({
					bounds: _bounds,
					categories: [PlaceCategory.AIRPORT],
					limit: 60,
				}),
			).rejects.toMatchObject({
				errorCode: MapsErrorCode.PROVIDER_TIMEOUT,
			});
		});

		it("reports a network failure as an unavailable provider", async () => {
			vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
			await expect(
				new PlacesRepository({
					placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
					searchRateLimiter: { limit: vi.fn() },
					detailsRateLimiter: { limit: vi.fn() },
				}).searchPlacesInArea({
					bounds: _bounds,
					categories: [PlaceCategory.AIRPORT],
					limit: 60,
				}),
			).rejects.toMatchObject({
				errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			});
		});
	});

	it("cancels landmark lookups with the shared map-generation deadline", async () => {
		const controller = new AbortController();
		const provider = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
			expect(init?.signal?.aborted).toBe(true);
			throw new DOMException("cancelled", "AbortError");
		});
		vi.stubGlobal("fetch", provider);
		controller.abort();
		await expect(
			new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}).searchPlacesInArea({
				bounds: _bounds,
				categories: [PlaceCategory.AIRPORT],
				limit: 60,

				signal: controller.signal,
			}),
		).rejects.toMatchObject({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT, retryable: true });
	});

	it.each([
		[429, true],
		[503, true],
		[401, false],
	] as const)("uses Maps retry policy for landmark provider status %s", async (status, retryable) => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn<typeof fetch>()
				.mockImplementation(async () => new Response(null, { status: status, headers: { "Retry-After": "5" } })),
		);
		await expect(
			new PlacesRepository({
				placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
				searchRateLimiter: { limit: vi.fn() },
				detailsRateLimiter: { limit: vi.fn() },
			}).searchPlacesInArea({
				bounds: _bounds,
				categories: [PlaceCategory.AIRPORT],
				limit: 60,
			}),
		).rejects.toMatchObject({
			errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
			retryable: retryable,
			retryAfterMs: retryable ? 5000 : undefined,
		});
	});

	describe("provider feature normalization", () => {
		it.each([undefined, "", "   "])("preserves the native OSM name when short_name is %j", async (shortName) => {
			expect(
				(
					await _placeFromProvider({
						feature: _feature({
							name: "Cologne Cathedral",
							categories: ["religion.place_of_worship"],
							datasource: { raw: { name: "Kölner Dom", short_name: shortName } },
						}),
					})
				)?.name,
			).toBe("Kölner Dom");
		});

		it("omits a localized provider name when both original OSM names are missing", async () => {
			expect(
				await _placeFromProvider({
					feature: _feature({
						name: "Cologne Cathedral",
						categories: ["religion.place_of_worship"],
						datasource: { raw: { name: undefined } },
					}),
				}),
			).toBeUndefined();
		});

		it("normalizes the primary short name, coordinates and Wikidata signal", async () => {
			expect(
				await _placeFromProvider({
					feature: _feature({
						name: "Aeroporto de São Paulo/Congonhas - Deputado Freitas Nobre",
						categories: ["airport", "airport.international"],
						datasource: { raw: { short_name: " Aeroporto de Congonhas ;Congonhas", wikidata: "Q1130578" } },
					}),
				}),
			).toEqual({
				name: "Aeroporto de Congonhas",
				category: PlaceCategory.AIRPORT,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: true,
			});
		});

		it("retains a brand without treating it as Wikidata notability", async () => {
			expect(
				await _placeFromProvider({
					feature: _feature({
						name: "Carrefour",
						categories: ["commercial", "commercial.supermarket"],
						datasource: { raw: { brand: "Carrefour" } },
					}),
				}),
			).toEqual({
				name: "Carrefour",
				category: PlaceCategory.SUPERMARKET,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: false,
				brand: "Carrefour",
			});
		});

		it.each([
			[" Estação AACD-Servidor;AACD – Servidor ", "Estação AACD-Servidor"],
			[1, "1"],
		] as const)("uses the primary original OSM name from %j", async (name, expected) => {
			expect(
				(await _placeFromProvider({ feature: _feature({ name: name, categories: ["public_transport.train"] }) }))?.name,
			).toBe(expected);
		});

		it("normalizes numeric OpenStreetMap tags and ignores unsupported tag values", async () => {
			expect(
				await _placeFromProvider({
					feature: _feature({
						name: "Aeroporto",
						categories: ["airport"],
						datasource: { raw: { short_name: 1, wikidata: 2, brand: 3, tourism: true, historic: {} } },
					}),
				}),
			).toEqual({
				name: "1",
				category: PlaceCategory.AIRPORT,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: true,
				brand: "3",
			});
		});

		it.each([
			[["tourism.attraction", "entertainment.museum"], PlaceCategory.ATTRACTION],
			[["tourism.attraction", "entertainment.zoo"], PlaceCategory.ATTRACTION],
			[["commercial.supermarket"], PlaceCategory.SUPERMARKET],
			[["commercial.department_store"], PlaceCategory.STORE],
			[["tourism.sights", "tourism.sights.place_of_worship.cathedral"], PlaceCategory.PLACE_OF_WORSHIP],
		] as const)("uses the first supported leaf category for provider tags %j", async (categories, expected) => {
			expect(
				await _placeFromProvider({
					feature: _feature({ name: "Known place", categories: categories, datasource: { raw: { wikidata: "Q1" } } }),
				}),
			).toMatchObject({ category: expected, notable: true });
		});

		it.each([
			{ categories: ["sport.stadium"] },
			{ name: " ", categories: ["sport.stadium"] },
			{ name: false, categories: ["sport.stadium"] },
			{ name: "Banco", categories: ["service.financial"] },
			{ name: "Sem coordenadas", categories: ["sport.stadium"], lat: "invalid" },
			{ name: "Latitude inválida", categories: ["sport.stadium"], lat: 91 },
			{ name: "Longitude inválida", categories: ["sport.stadium"], lon: -181 },
			{
				name: "Nome alternativo vazio",
				categories: ["sport.stadium"],
				datasource: { raw: { name: undefined, short_name: "" } },
			},
		])("drops unnamed, uncategorized or malformed features %j", async (properties) => {
			expect(await _placeFromProvider({ feature: _feature(properties) })).toBeUndefined();
		});

		it.each([
			{ tourism: "viewpoint" },
			{ tourism: "artwork" },
			{ historic: "memorial" },
			{ historic: "monument" },
		] as const)("normalizes attractions with tags %j without adding a special classification", async (raw) => {
			expect(
				await _placeFromProvider({
					feature: _feature({ name: "Attraction", categories: ["tourism.attraction"], datasource: { raw: raw } }),
				}),
			).toEqual({
				name: "Attraction",
				category: PlaceCategory.ATTRACTION,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: false,
			});
		});
	});
});
