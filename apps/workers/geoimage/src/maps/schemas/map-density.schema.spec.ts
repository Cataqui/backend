import { MapDensitySchema } from "./map-density.schema";

describe("MapDensitySchema", () => {
	it.each([1, 2])("accepts density %s", (density) => {
		expect(MapDensitySchema.parse(density)).toBe(density);
	});

	it.each([undefined, null, 0, -1, 1.5, 3, NaN, Infinity, "1", "2", true])("rejects density %s", (density) => {
		expect(MapDensitySchema.safeParse(density).success).toBe(false);
	});
});
