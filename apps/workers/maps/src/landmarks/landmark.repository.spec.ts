import { MapsErrorCode } from "../shared/maps-error-code.enum";
import { LandmarkCategory, LandmarkQueryGroups } from "./landmark-category";
import { LandmarkRepository } from "./landmark.repository";

const _bounds = { north: -23.5, south: -23.6, east: -46.6, west: -46.7 };

function _feature(properties: Record<string, unknown>) {
	return { type: "Feature", properties: { lat: -23.55, lon: -46.65, ...properties } };
}

async function _findWith(features: unknown[]) {
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const categories = new URL(String(input)).searchParams.get("categories");
			return Response.json({ features: categories?.startsWith("airport") ? features : [] });
		}),
	);
	return new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds });
}

afterEach(() => vi.unstubAllGlobals());

describe("LandmarkRepository", () => {
	it("requests every category group inside the visible map bounds", async () => {
		const provider = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ features: [] }));
		vi.stubGlobal("fetch", provider);

		await new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds });

		const requests = provider.mock.calls.map(([input]) => Object.fromEntries(new URL(String(input)).searchParams));
		expect(requests).toHaveLength(LandmarkQueryGroups.length);
		expect(requests[0]).toEqual({
			categories: "airport,public_transport.subway,public_transport.train",
			filter: "rect:-46.7,-23.5,-46.6,-23.6",
			limit: "60",
			lang: "pt",
			apiKey: "test-key",
		});
	});

	it("normalizes places with their Wikidata and brand signals", async () => {
		const places = await _findWith([
			_feature({
				name: "Aeroporto de São Paulo/Congonhas - Deputado Freitas Nobre",
				categories: ["airport", "airport.international"],
				datasource: { raw: { short_name: "Aeroporto de Congonhas", wikidata: "Q1130578" } },
			}),
			_feature({
				name: "Carrefour",
				categories: ["commercial", "commercial.supermarket"],
				datasource: { raw: { brand: "Carrefour" } },
			}),
		]);
		expect(places).toEqual([
			{
				name: "Aeroporto de Congonhas",
				category: LandmarkCategory.AIRPORT,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: true,
			},
			{
				name: "Carrefour",
				category: LandmarkCategory.STORE,
				coordinates: { latitude: -23.55, longitude: -46.65 },
				notable: false,
				brand: "Carrefour",
			},
		]);
	});

	it("uses the first of several semicolon-separated names and accepts numeric names", async () => {
		const places = await _findWith([
			_feature({ name: "Estação AACD-Servidor;AACD – Servidor", categories: ["public_transport.subway"] }),
			_feature({ name: 1, categories: ["public_transport.train"] }),
		]);
		expect(places.map((place) => place.name)).toEqual(["Estação AACD-Servidor", "1"]);
	});

	it("drops unnamed, uncategorized, malformed and little-known attraction places", async () => {
		const places = await _findWith([
			_feature({ categories: ["sport.stadium"] }),
			_feature({ name: "Banco", categories: ["service.financial"] }),
			_feature({ name: "Sem coordenadas", categories: ["sport.stadium"], lat: "invalid" }),
			_feature({ name: "Estátua", categories: ["tourism.attraction"], datasource: { raw: { historic: "memorial" } } }),
			_feature({ name: "Mirante", categories: ["tourism.attraction"], datasource: { raw: { tourism: "viewpoint" } } }),
			_feature({ name: "Escultura", categories: ["tourism.attraction"], datasource: { raw: { tourism: "artwork" } } }),
		]);
		expect(places).toEqual([]);
	});

	it("reports a provider error status as an unavailable provider", async () => {
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 503 })));
		await expect(
			new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds }),
		).rejects.toMatchObject({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE });
	});

	it("reports a response without features as an unavailable provider", async () => {
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("not json")));
		await expect(
			new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds }),
		).rejects.toMatchObject({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE });
	});

	it("reports a timed-out request as a provider timeout", async () => {
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("slow", "TimeoutError")));
		await expect(
			new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds }),
		).rejects.toMatchObject({ errorCode: MapsErrorCode.PROVIDER_TIMEOUT });
	});

	it("reports a network failure as an unavailable provider", async () => {
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
		await expect(
			new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds }),
		).rejects.toMatchObject({ errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE });
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
		new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({
			bounds: _bounds,
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
		new LandmarkRepository({ config: { apiKey: "test-key" } }).findPlaces({ bounds: _bounds }),
	).rejects.toMatchObject({
		errorCode: MapsErrorCode.PROVIDER_UNAVAILABLE,
		retryable: retryable,
		retryAfterMs: retryable ? 5000 : undefined,
	});
});
