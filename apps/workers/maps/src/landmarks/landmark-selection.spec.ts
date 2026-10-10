import { getMapCoordinates } from "../modules/static/web-mercator";
import { LandmarkCategory } from "./landmark-category";
import type { LandmarkPlace } from "./landmark-place.interface";
import { LandmarkLabelPosition, selectLandmarks } from "./landmark-selection";

const _center = { latitude: -23.55, longitude: -46.63 };
const _size = { width: 480, height: 1280 };
const _area = { left: 0, top: 320, right: 480, bottom: 960 };

function _place(params: {
	name: string;
	category: LandmarkCategory;
	pixel: { x: number; y: number };
	notable?: boolean;
	brand?: string;
}): LandmarkPlace {
	return {
		name: params.name,
		category: params.category,
		coordinates: getMapCoordinates({ pixel: params.pixel, center: _center, size: _size, zoom: 13 }),
		notable: params.notable ?? false,
		...(params.brand === undefined ? {} : { brand: params.brand }),
	};
}

function _select(places: LandmarkPlace[], maxLandmarks = 10) {
	return selectLandmarks({
		places: places,
		center: _center,
		size: _size,
		zoom: 13,
		area: _area,
		maxLandmarks: maxLandmarks,
	});
}

describe("selectLandmarks", () => {
	it("places a pin exactly on the projected coordinates of the place", () => {
		const [landmark] = _select([
			_place({
				name: "Shopping Anália Franco",
				category: LandmarkCategory.SHOPPING_MALL,
				pixel: { x: 300, y: 700 },
				notable: true,
			}),
		]);
		expect(landmark!.x).toBeCloseTo(300, 6);
		expect(landmark!.y).toBeCloseTo(700, 6);
	});

	it("prefers famous places over closer unknown branches", () => {
		const landmarks = _select(
			[
				_place({ name: "Carrefour", category: LandmarkCategory.STORE, pixel: { x: 250, y: 640 }, brand: "Carrefour" }),
				_place({
					name: "Hospital São Cristóvão",
					category: LandmarkCategory.HOSPITAL,
					pixel: { x: 100, y: 900 },
					notable: true,
				}),
			],
			1,
		);
		expect(landmarks.map((landmark) => landmark.label)).toEqual(["Hospital São Cristóvão"]);
	});

	it("ranks airports above every other category", () => {
		const landmarks = _select(
			[
				_place({
					name: "Shopping Ibirapuera",
					category: LandmarkCategory.SHOPPING_MALL,
					pixel: { x: 240, y: 640 },
					notable: true,
				}),
				_place({
					name: "Aeroporto de Congonhas",
					category: LandmarkCategory.AIRPORT,
					pixel: { x: 200, y: 950 },
					notable: true,
				}),
			],
			1,
		);
		expect(landmarks[0]!.category).toBe(LandmarkCategory.AIRPORT);
	});

	it("keeps unknown airports and stations but drops unknown unbranded places and parks without Wikidata", () => {
		const landmarks = _select([
			_place({ name: "Brooklin", category: LandmarkCategory.STATION, pixel: { x: 60, y: 400 } }),
			_place({ name: "Aeroclube", category: LandmarkCategory.AIRPORT, pixel: { x: 60, y: 600 } }),
			_place({ name: "Bar do Zé", category: LandmarkCategory.RESTAURANT, pixel: { x: 60, y: 800 } }),
			_place({
				name: "Praça Sem Nome",
				category: LandmarkCategory.PARK,
				pixel: { x: 300, y: 400 },
				brand: "Prefeitura",
			}),
		]);
		expect(landmarks.map((landmark) => landmark.label).sort()).toEqual(["Aeroclube", "Brooklin"]);
	});

	it("shows a chain once, at its best-placed branch", () => {
		const landmarks = _select([
			_place({
				name: "McDonald's",
				category: LandmarkCategory.RESTAURANT,
				pixel: { x: 60, y: 400 },
				brand: "McDonald's",
			}),
			_place({
				name: "McDonald's",
				category: LandmarkCategory.RESTAURANT,
				pixel: { x: 250, y: 660 },
				brand: "McDonald's",
			}),
		]);
		expect(landmarks.map((landmark) => [landmark.label, Math.round(landmark.y)])).toEqual([["McDonald's", 660]]);
	});

	it("ignores places outside the visible area", () => {
		expect(
			_select([
				_place({ name: "Parque Hidden", category: LandmarkCategory.PARK, pixel: { x: 240, y: 100 }, notable: true }),
			]),
		).toEqual([]);
	});

	it("caps stations and restaurants at three each so other kinds of places still appear", () => {
		const stations = Array.from({ length: 5 }, (_, index) =>
			_place({
				name: `Estação ${index}`,
				category: LandmarkCategory.STATION,
				pixel: { x: 40, y: 340 + index * 60 },
				notable: true,
			}),
		);
		const restaurants = Array.from({ length: 5 }, (_, index) =>
			_place({
				name: `Restaurante ${index}`,
				category: LandmarkCategory.RESTAURANT,
				pixel: { x: 300, y: 340 + index * 60 },
				brand: `Marca ${index}`,
			}),
		);
		const counts = _select([...stations, ...restaurants]).reduce<Record<string, number>>((result, landmark) => {
			result[landmark.category] = (result[landmark.category] ?? 0) + 1;
			return result;
		}, {});
		expect(counts).toEqual({ [LandmarkCategory.STATION]: 3, [LandmarkCategory.RESTAURANT]: 3 });
	});

	it("stops at the requested number of landmarks", () => {
		const places = Array.from({ length: 8 }, (_, index) =>
			_place({
				name: `Shopping ${index}`,
				category: LandmarkCategory.SHOPPING_MALL,
				pixel: { x: 40, y: 340 + index * 70 },
				notable: true,
			}),
		);
		expect(_select(places, 4)).toHaveLength(4);
	});

	it("never lets a pin cover another pin", () => {
		const landmarks = _select([
			_place({
				name: "Shopping A",
				category: LandmarkCategory.SHOPPING_MALL,
				pixel: { x: 200, y: 640 },
				notable: true,
			}),
			_place({
				name: "Shopping B",
				category: LandmarkCategory.SHOPPING_MALL,
				pixel: { x: 210, y: 645 },
				notable: true,
			}),
		]);
		expect(landmarks).toHaveLength(1);
	});

	it("puts the label on the right when it fits and on the left near the right edge", () => {
		const landmarks = _select([
			_place({ name: "Belém", category: LandmarkCategory.STATION, pixel: { x: 60, y: 500 }, notable: true }),
			_place({ name: "Penha", category: LandmarkCategory.STATION, pixel: { x: 460, y: 800 }, notable: true }),
		]);
		expect(Object.fromEntries(landmarks.map((landmark) => [landmark.label, landmark.labelPosition]))).toEqual({
			Belém: LandmarkLabelPosition.RIGHT,
			Penha: LandmarkLabelPosition.LEFT,
		});
	});

	it("moves a label above the pin when neither side has room", () => {
		const [landmark] = selectLandmarks({
			places: [{ name: "Hospital Central", category: LandmarkCategory.HOSPITAL, coordinates: _center, notable: true }],
			center: _center,
			size: { width: 200, height: 200 },
			zoom: 13,
			area: { left: 0, top: 0, right: 200, bottom: 200 },
			maxLandmarks: 5,
		});
		expect(landmark!.labelPosition).toBe(LandmarkLabelPosition.ABOVE);
	});

	it("moves a label below the pin when there is no room above either", () => {
		const [landmark] = selectLandmarks({
			places: [
				{
					name: "Hospital Central",
					category: LandmarkCategory.HOSPITAL,
					coordinates: getMapCoordinates({
						pixel: { x: 100, y: 25 },
						center: _center,
						size: { width: 200, height: 100 },
						zoom: 13,
					}),
					notable: true,
				},
			],
			center: _center,
			size: { width: 200, height: 100 },
			zoom: 13,
			area: { left: 0, top: 0, right: 200, bottom: 100 },
			maxLandmarks: 5,
		});
		expect(landmark?.labelPosition).toBe(LandmarkLabelPosition.BELOW);
	});

	it("names stations that share a category word so they are not read as that place", () => {
		const [landmark] = _select([
			_place({ name: "Shopping", category: LandmarkCategory.STATION, pixel: { x: 100, y: 640 } }),
		]);
		expect(landmark!.label).toBe("Estação Shopping");
	});

	it("shortens long names with an ellipsis", () => {
		const [landmark] = _select([
			_place({
				name: "Escola Superior de Propaganda e Marketing",
				category: LandmarkCategory.UNIVERSITY,
				pixel: { x: 40, y: 640 },
				notable: true,
			}),
		]);
		expect(landmark!.label).toBe("Escola Superior de Propag…");
	});

	it("skips a place whose label cannot fit anywhere", () => {
		const narrow = selectLandmarks({
			places: [
				{
					name: "Universidade Federal Muito Grande",
					category: LandmarkCategory.UNIVERSITY,
					coordinates: _center,
					notable: true,
				},
			],
			center: _center,
			size: { width: 60, height: 60 },
			zoom: 13,
			area: { left: 0, top: 0, right: 60, bottom: 60 },
			maxLandmarks: 5,
		});
		expect(narrow).toEqual([]);
	});
});
