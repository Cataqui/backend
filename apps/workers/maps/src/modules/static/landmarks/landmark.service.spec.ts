import { PlacesService } from "../../places/places.service";
import { PlacesRepository } from "../../places/places.repository";
import { PlaceCategory } from "../../places/place-category";
import type { PlaceAreaSearchOutput } from "../../places/schemas/place-area-search-output.schema";
import { LandmarkService } from "./landmark.service";
import { LandmarkCategoryConfig } from "./landmark-category.config";
import { LandmarkLabelPosition } from "./landmark-label-position.enum";

const _tall = {
	center: { latitude: -23.55, longitude: -46.63 },
	size: { width: 480, height: 1280 },
} as const;
const _square = {
	center: { latitude: -23.55, longitude: -46.63 },
	size: { width: 480, height: 480 },
} as const;

function _service(params: { places?: PlaceAreaSearchOutput } = {}) {
	const repository = new PlacesRepository({
		placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
		searchRateLimiter: { limit: vi.fn() },
		detailsRateLimiter: { limit: vi.fn() },
	});
	const findPlaces = vi.spyOn(repository, "searchPlacesInArea").mockResolvedValue(params.places ?? []);
	const places = new PlacesService({ repository: repository });
	return { service: new LandmarkService({ places: places }), findPlaces: findPlaces };
}

function _shoppingAtCenter(): PlaceAreaSearchOutput[number] {
	return {
		name: "Shopping Center",
		category: PlaceCategory.SHOPPING_MALL,
		coordinates: { latitude: -23.551, longitude: -46.63 },
		notable: true,
	};
}

afterEach(() => vi.restoreAllMocks());

describe("LandmarkService", () => {
	it("places a landmark at the image center when its coordinates match the map center", async () => {
		const { service } = _service({ places: [{ ..._shoppingAtCenter(), coordinates: _tall.center }] });
		expect(await service.getLandmarks(_tall)).toMatchObject([{ x: 240, y: 640 }]);
	});

	it("places a landmark east and north of the center to the right and above it", async () => {
		const { service } = _service({
			places: [{ ..._shoppingAtCenter(), coordinates: { latitude: -23.54, longitude: -46.62 } }],
		});
		const [landmark] = await service.getLandmarks(_tall);
		expect(landmark!.x).toBeGreaterThan(240);
		expect(landmark!.y).toBeLessThan(640);
	});

	it("places a landmark one kilometer east about 57 logical pixels right at zoom 13 in São Paulo", async () => {
		const { service } = _service({
			places: [
				{
					..._shoppingAtCenter(),
					coordinates: {
						latitude: -23.55,
						longitude: -46.63 + 1 / (111.32 * Math.cos((23.55 * Math.PI) / 180)),
					},
				},
			],
		});
		const [landmark] = await service.getLandmarks(_tall);
		expect(landmark!.x - 240).toBeCloseTo(57, 0);
	});

	it("returns no pins when no known place is nearby", async () => {
		const { service } = _service();
		expect(await service.getLandmarks(_tall)).toEqual([]);
	});

	it("selects known places and returns their logical pin positions", async () => {
		const { service } = _service({ places: [_shoppingAtCenter()] });
		expect(await service.getLandmarks(_tall)).toEqual([
			expect.objectContaining({ label: "Shopping Center", category: PlaceCategory.SHOPPING_MALL, x: 240 }),
		]);
	});

	it("looks for places only in the middle half that the app shows of a tall image", async () => {
		const { service, findPlaces } = _service();
		await service.getLandmarks(_tall);
		const { bounds } = findPlaces.mock.calls[0]![0];
		expect(
			[bounds.north - _tall.center.latitude, _tall.center.latitude - bounds.south].map((value) => value.toFixed(3)),
		).toEqual(["0.050", "0.050"]);
		expect(
			[_tall.center.longitude - bounds.west, bounds.east - _tall.center.longitude].map((value) => value.toFixed(3)),
		).toEqual(["0.041", "0.041"]);
	});

	it("looks for places across the whole square image", async () => {
		const { service, findPlaces } = _service();
		await service.getLandmarks(_square);
		const { bounds } = findPlaces.mock.calls[0]![0];
		expect((bounds.north - bounds.south).toFixed(3)).toBe("0.076");
	});

	it("limits a square image to fewer pins than a tall one", async () => {
		const places = Array.from({ length: 12 }, (_, index) => ({
			..._shoppingAtCenter(),
			name: `Shopping ${index}`,
			coordinates: { latitude: -23.565 + index * 0.0028, longitude: -46.6 },
		}));
		const { service } = _service({ places: places });
		expect(await service.getLandmarks(_square)).toHaveLength(5);
		expect((await service.getLandmarks(_tall)).length).toBeGreaterThan(5);
	});

	it("passes the generation signal to the provider", async () => {
		const { service, findPlaces } = _service();
		const controller = new AbortController();
		await service.getLandmarks({ center: _tall.center, size: _tall.size, signal: controller.signal });
		expect(findPlaces).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
	});

	it("fails selection when places cannot be loaded", async () => {
		const { service, findPlaces } = _service();
		findPlaces.mockRejectedValue(new Error("provider down"));
		await expect(service.getLandmarks(_tall)).rejects.toThrow("provider down");
	});
});

const _center = { latitude: -23.55, longitude: -46.63 };
const _size = { width: 480, height: 1280 };
// Build geographic test fixtures from requested image positions without calling service internals.
function _fixtureCoordinates(params: {
	pixel: { x: number; y: number };
	center: { latitude: number; longitude: number };
	size: { width: number; height: number };
	zoom: number;
}): { latitude: number; longitude: number } {
	const worldSize = 256 * 2 ** params.zoom;
	const centerSine = Math.sin((params.center.latitude * Math.PI) / 180);
	const centerY = (0.5 - Math.log((1 + centerSine) / (1 - centerSine)) / (4 * Math.PI)) * worldSize;
	const y = centerY + params.pixel.y - params.size.height / 2;
	return {
		latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI,
		longitude: params.center.longitude + ((params.pixel.x - params.size.width / 2) / worldSize) * 360,
	};
}

function _place(params: {
	name: string;
	category: PlaceCategory;
	pixel: {
		x: number;
		y: number;
	};
	notable?: boolean;
	brand?: string;
}): PlaceAreaSearchOutput[number] {
	return {
		name: params.name,
		category: params.category,
		coordinates: _fixtureCoordinates({ pixel: params.pixel, center: _center, size: _size, zoom: 13 }),
		notable: params.notable ?? false,
		...(params.brand === undefined ? {} : { brand: params.brand }),
	};
}
async function _getLandmarksForPlaces(params: {
	places: PlaceAreaSearchOutput;
	size?: {
		width: number;
		height: number;
	};
}) {
	const { service } = _service({ places: params.places });
	return service.getLandmarks({ center: _center, size: params.size ?? _size });
}
describe("LandmarkService selection and placement", () => {
	it("fits a reference label near the edge when Mateo's negative tracking makes room", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				{
					name: "São Bento",
					category: PlaceCategory.PLACE_OF_WORSHIP,
					coordinates: _center,
					notable: true,
				},
			],
			size: { width: 89, height: 100 },
		});
		expect(landmarks).toMatchObject([{ label: "São Bento", labelPosition: LandmarkLabelPosition.ABOVE }]);
	});
	it("includes a notable cathedral as an area reference", async () => {
		expect(
			await _getLandmarksForPlaces({
				places: [
					_place({
						name: "Catedral da Sé",
						category: PlaceCategory.PLACE_OF_WORSHIP,
						pixel: { x: 240, y: 640 },
						notable: true,
					}),
				],
			}),
		).toMatchObject([{ label: "Catedral da Sé", category: PlaceCategory.PLACE_OF_WORSHIP }]);
	});
	it.each([undefined, "Church network"])("omits non-notable worship places even with brand %s", async (brand) => {
		expect(
			await _getLandmarksForPlaces({
				places: [
					_place({
						name: "Neighborhood church",
						category: PlaceCategory.PLACE_OF_WORSHIP,
						pixel: { x: 240, y: 640 },
						...(brand === undefined ? {} : { brand: brand }),
					}),
				],
			}),
		).toEqual([]);
	});
	it("places a pin exactly on the projected coordinates of the place", async () => {
		const [landmark] = await _getLandmarksForPlaces({
			places: [
				_place({
					name: "Shopping Anália Franco",
					category: PlaceCategory.SHOPPING_MALL,
					pixel: { x: 300, y: 700 },
					notable: true,
				}),
			],
		});
		expect(landmark!.x).toBeCloseTo(300, 6);
		expect(landmark!.y).toBeCloseTo(700, 6);
	});
	it("prefers famous places over closer unknown branches", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({ name: "Carrefour", category: PlaceCategory.STORE, pixel: { x: 250, y: 640 }, brand: "Carrefour" }),
				_place({
					name: "Hospital São Cristóvão",
					category: PlaceCategory.HOSPITAL,
					pixel: { x: 100, y: 900 },
					notable: true,
				}),
			],
		});
		expect(landmarks[0]!.label).toBe("Hospital São Cristóvão");
	});
	it("ranks airports above every other category", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({
					name: "Shopping Ibirapuera",
					category: PlaceCategory.SHOPPING_MALL,
					pixel: { x: 240, y: 640 },
					notable: true,
				}),
				_place({
					name: "Aeroporto de Congonhas",
					category: PlaceCategory.AIRPORT,
					pixel: { x: 200, y: 950 },
					notable: true,
				}),
			],
		});
		expect(landmarks[0]!.category).toBe(PlaceCategory.AIRPORT);
	});
	it("keeps unknown airports and stations but drops unknown unbranded places and parks without Wikidata", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({ name: "Brooklin", category: PlaceCategory.TRAIN_STATION, pixel: { x: 60, y: 400 } }),
				_place({ name: "Aeroclube", category: PlaceCategory.AIRPORT, pixel: { x: 60, y: 600 } }),
				_place({ name: "Bar do Zé", category: PlaceCategory.RESTAURANT, pixel: { x: 60, y: 800 } }),
				_place({
					name: "Praça Sem Nome",
					category: PlaceCategory.PARK,
					pixel: { x: 300, y: 400 },
					brand: "Prefeitura",
				}),
			],
		});
		expect(landmarks.map((landmark) => landmark.label).sort()).toEqual(["Aeroclube", "Brooklin"]);
	});
	it("shows a chain once, at its best-placed branch", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({
					name: "McDonald's",
					category: PlaceCategory.RESTAURANT,
					pixel: { x: 60, y: 400 },
					brand: "McDonald's",
				}),
				_place({
					name: "McDonald's",
					category: PlaceCategory.RESTAURANT,
					pixel: { x: 250, y: 660 },
					brand: "McDonald's",
				}),
			],
		});
		expect(landmarks.map((landmark) => [landmark.label, Math.round(landmark.y)])).toEqual([["McDonald's", 660]]);
	});
	it("ignores places outside the visible area", async () => {
		expect(
			await _getLandmarksForPlaces({
				places: [
					_place({ name: "Parque Hidden", category: PlaceCategory.PARK, pixel: { x: 240, y: 100 }, notable: true }),
				],
			}),
		).toEqual([]);
	});
	it("allows more than three train stations and restaurants when they fit within the overall limit", async () => {
		const stations = Array.from({ length: 5 }, (_, index) =>
			_place({
				name: `Estação ${index}`,
				category: PlaceCategory.TRAIN_STATION,
				pixel: { x: 40, y: 340 + index * 60 },
				notable: true,
			}),
		);
		const restaurants = Array.from({ length: 5 }, (_, index) =>
			_place({
				name: `Restaurante ${index}`,
				category: PlaceCategory.RESTAURANT,
				pixel: { x: 300, y: 340 + index * 60 },
				brand: `Marca ${index}`,
			}),
		);
		const counts = (
			await _getLandmarksForPlaces({
				places: [...stations, ...restaurants],
			})
		).reduce<Record<string, number>>((result, landmark) => {
			result[landmark.category] = (result[landmark.category] ?? 0) + 1;
			return result;
		}, {});
		expect(counts).toEqual({ [PlaceCategory.TRAIN_STATION]: 5, [PlaceCategory.RESTAURANT]: 5 });
	});
	it("stops at the configured limit for a tall map", async () => {
		const places = Array.from({ length: 12 }, (_, index) =>
			_place({
				name: `Shopping ${index}`,
				category: PlaceCategory.SHOPPING_MALL,
				pixel: { x: 40, y: 340 + index * 50 },
				notable: true,
			}),
		);
		expect(
			await _getLandmarksForPlaces({
				places: places,
			}),
		).toHaveLength(10);
	});
	it("never lets a pin cover another pin", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({
					name: "Shopping A",
					category: PlaceCategory.SHOPPING_MALL,
					pixel: { x: 200, y: 640 },
					notable: true,
				}),
				_place({
					name: "Shopping B",
					category: PlaceCategory.SHOPPING_MALL,
					pixel: { x: 210, y: 645 },
					notable: true,
				}),
			],
		});
		expect(landmarks).toHaveLength(1);
	});
	it("puts the label on the right when it fits and on the left near the right edge", async () => {
		const landmarks = await _getLandmarksForPlaces({
			places: [
				_place({ name: "Belém", category: PlaceCategory.TRAIN_STATION, pixel: { x: 60, y: 500 }, notable: true }),
				_place({ name: "Penha", category: PlaceCategory.TRAIN_STATION, pixel: { x: 460, y: 800 }, notable: true }),
			],
		});
		expect(Object.fromEntries(landmarks.map((landmark) => [landmark.label, landmark.labelPosition]))).toEqual({
			Belém: LandmarkLabelPosition.RIGHT,
			Penha: LandmarkLabelPosition.LEFT,
		});
	});
	it("moves a label above the pin when neither side has room", async () => {
		const [landmark] = await _getLandmarksForPlaces({
			places: [{ name: "Hospital Central", category: PlaceCategory.HOSPITAL, coordinates: _center, notable: true }],
			size: { width: 200, height: 200 },
		});
		expect(landmark!.labelPosition).toBe(LandmarkLabelPosition.ABOVE);
	});
	it("moves a label below the pin when there is no room above either", async () => {
		const [landmark] = await _getLandmarksForPlaces({
			places: [
				{
					name: "Hospital Central",
					category: PlaceCategory.HOSPITAL,
					coordinates: _fixtureCoordinates({
						pixel: { x: 100, y: 25 },
						center: _center,
						size: { width: 200, height: 100 },
						zoom: 13,
					}),
					notable: true,
				},
			],
			size: { width: 200, height: 100 },
		});
		expect(landmark?.labelPosition).toBe(LandmarkLabelPosition.BELOW);
	});
	it.each(["Shopping", "Centro", "Aeroporto", "Hospital", "中央駅", "Hauptbahnhof"])(
		"preserves the native station name %s without adding a localized prefix",
		async (name) => {
			const [landmark] = await _getLandmarksForPlaces({
				places: [_place({ name: name, category: PlaceCategory.TRAIN_STATION, pixel: { x: 100, y: 640 } })],
			});
			expect(landmark!.label).toBe(name);
		},
	);
	it("shortens long names with an ellipsis", async () => {
		const [landmark] = await _getLandmarksForPlaces({
			places: [
				_place({
					name: "Escola Superior de Propaganda e Marketing",
					category: PlaceCategory.UNIVERSITY,
					pixel: { x: 40, y: 640 },
					notable: true,
				}),
			],
		});
		expect(landmark!.label).toBe("Escola Superior de Propag…");
	});
	it("skips a place whose label cannot fit anywhere", async () => {
		const narrow = await _getLandmarksForPlaces({
			places: [
				{
					name: "Universidade Federal Muito Grande",
					category: PlaceCategory.UNIVERSITY,
					coordinates: _center,
					notable: true,
				},
			],
			size: { width: 60, height: 60 },
		});
		expect(narrow).toEqual([]);
	});
});
it.each(Object.values(PlaceCategory).filter((category) => LandmarkCategoryConfig[category] === undefined))(
	"does not pin unsupported place category %s even when notable and branded",
	async (category) => {
		expect(
			await _getLandmarksForPlaces({
				places: [
					_place({ name: "Known place", category: category, pixel: { x: 240, y: 640 }, notable: true, brand: "Brand" }),
				],
			}),
		).toEqual([]);
	},
);

it.each([{ tourism: "artwork" }, { tourism: "viewpoint" }, { historic: "memorial" }, { historic: "monument" }])(
	"allows notable reference landmarks with provider tags %j",
	async (tags) => {
		const repository = new PlacesRepository({
			placesConfig: { googlePlacesApiKey: "test-google", geoapifyApiKey: "test-key" },
			searchRateLimiter: { limit: vi.fn() },
			detailsRateLimiter: { limit: vi.fn() },
			fetchImplementation: vi.fn<typeof fetch>().mockImplementation(async () =>
				Response.json({
					features: [
						{
							type: "Feature",
							properties: {
								name: "Reference",
								lat: _center.latitude,
								lon: _center.longitude,
								categories: ["tourism.attraction"],
								datasource: { raw: { ...tags, name: "Reference", wikidata: "Q1" } },
							},
						},
					],
				}),
			),
		});
		const service = new LandmarkService({ places: new PlacesService({ repository: repository }) });
		expect(await service.getLandmarks(_tall)).toEqual([
			expect.objectContaining({ label: "Reference", category: PlaceCategory.ATTRACTION }),
		]);
	},
);

it("requests six category groups independently so busy areas cannot crowd out reference types", async () => {
	const { service, findPlaces } = _service();
	await service.getLandmarks(_tall);
	expect(
		findPlaces.mock.calls.map(([params]) => ({
			categories: params.categories,
			limit: params.limit,
		})),
	).toEqual([
		{ categories: [PlaceCategory.AIRPORT, PlaceCategory.TRAIN_STATION], limit: 60 },
		{
			categories: [
				PlaceCategory.SHOPPING_MALL,
				PlaceCategory.STADIUM,
				PlaceCategory.HOSPITAL,
				PlaceCategory.UNIVERSITY,
				PlaceCategory.ATTRACTION,
				PlaceCategory.MUSEUM,
				PlaceCategory.ZOO,
			],
			limit: 100,
		},
		{ categories: [PlaceCategory.PLACE_OF_WORSHIP], limit: 60 },
		{ categories: [PlaceCategory.PARK], limit: 100 },
		{ categories: [PlaceCategory.SUPERMARKET, PlaceCategory.STORE], limit: 60 },
		{ categories: [PlaceCategory.RESTAURANT], limit: 300 },
	]);
});
