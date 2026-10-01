import { MapSizes } from "../../maps/map-sizes";
import { ImageQuerySchema } from "./image-query.schema";

describe("ImageQuerySchema", () => {
	it.each(Object.entries(MapSizes))("normalizes %s into typed rendering options", (name, size) => {
		const input = ImageQuerySchema.parse({ latitude: " -23.55050 ", longitude: "-4.66333e1", size: name });
		expect(input).toEqual({ latitude: -23.5505, longitude: -46.6333, map: { size: size, density: 2 } });
	});

	it.each(["1", "2"])("normalizes density %s into a number", (density) => {
		const input = ImageQuerySchema.parse({ latitude: "0", longitude: "0", size: "480x480", density: density });
		expect(input.map.density).toBe(Number(density));
	});

	it("returns flat violations before transforming invalid options", () => {
		const result = ImageQuerySchema.safeParse({ latitude: "", longitude: "Infinity", size: "960x2560", density: "3" });
		expect(result.success).toBe(false);
		if (result.success) throw new Error("Expected query validation to fail.");
		expect(result.error.issues.map((issue) => issue.path)).toEqual([
			["latitude"],
			["longitude"],
			["size"],
			["density"],
		]);
		expect(result.error.issues.slice(2).map((issue) => issue.message)).toEqual([
			"Map size must be 480x1280 or 480x480.",
			"Density must be 1 or 2.",
		]);
	});
});

it.each([
	{ latitude: "-90", longitude: "-180" },
	{ latitude: "90", longitude: "180" },
	{ latitude: "0", longitude: "0" },
])("accepts geographic query bounds %j", (coordinates) => {
	const input = ImageQuerySchema.parse({ ...coordinates, size: "480x1280" });
	expect(input.latitude).toBe(Number(coordinates.latitude));
	expect(input.longitude).toBe(Number(coordinates.longitude));
	expect(input.map.density).toBe(2);
});

it.each(["NaN", "Infinity", "-Infinity", "-90.01", "90.01"])("rejects invalid query latitude %s", (latitude) => {
	expect(ImageQuerySchema.safeParse({ latitude: latitude, longitude: "0", size: "480x480" }).success).toBe(false);
});

it.each(["NaN", "Infinity", "-Infinity", "-180.01", "180.01"])("rejects invalid query longitude %s", (longitude) => {
	expect(ImageQuerySchema.safeParse({ latitude: "0", longitude: longitude, size: "480x480" }).success).toBe(false);
});
