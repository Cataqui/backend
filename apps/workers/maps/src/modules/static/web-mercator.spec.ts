import { getMapCoordinates, getMapPixel } from "./web-mercator";

const _view = { center: { latitude: -23.55, longitude: -46.63 }, size: { width: 480, height: 1280 }, zoom: 13 };

describe("web mercator", () => {
	it("projects the map center to the image center", () => {
		expect(getMapPixel({ coordinates: _view.center, ..._view })).toEqual({ x: 240, y: 640 });
	});

	it("puts places east of the center to the right and north of it higher up", () => {
		const pixel = getMapPixel({ coordinates: { latitude: -23.5, longitude: -46.6 }, ..._view });
		expect([pixel.x > 240, pixel.y < 640]).toEqual([true, true]);
	});

	it("matches the static map scale of about 17.5 meters per pixel at zoom 13 in São Paulo", () => {
		const oneKilometerEast = getMapPixel({
			coordinates: { latitude: -23.55, longitude: -46.63 + 1 / (111.32 * Math.cos((23.55 * Math.PI) / 180)) },
			..._view,
		});
		expect(oneKilometerEast.x - 240).toBeCloseTo(57, 0);
	});

	it.each([
		[0, 0],
		[480, 1280],
		[123.5, 987.25],
	])("converts pixel (%d, %d) back to the same coordinates", (x, y) => {
		const coordinates = getMapCoordinates({ pixel: { x: x, y: y }, ..._view });
		const pixel = getMapPixel({ coordinates: coordinates, ..._view });
		expect([pixel.x, pixel.y].map((value) => Math.round(value * 1e6) / 1e6)).toEqual([x, y]);
	});
});
