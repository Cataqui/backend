import { LocationInputSchema } from "./location-input.schema";

describe("LocationInputSchema", () => {
	it.each([
		{ latitude: -90, longitude: -180 },
		{ latitude: 90, longitude: 180 },
		{ latitude: 0, longitude: 0 },
	])("accepts geographic bounds %j", (input) => {
		expect(LocationInputSchema.parse({ ...input, map: { size: { width: 480, height: 1280 } } })).toEqual({
			...input,
			map: { size: { width: 480, height: 1280 }, density: 2 },
		});
	});
	it.each([NaN, Infinity, -Infinity, -90.01, 90.01])("rejects invalid latitude %s", (latitude) => {
		expect(
			LocationInputSchema.safeParse({ latitude: latitude, longitude: 0, map: { size: { width: 480, height: 480 } } })
				.success,
		).toBe(false);
	});
	it.each([NaN, Infinity, -Infinity, -180.01, 180.01])("rejects invalid longitude %s", (longitude) => {
		expect(
			LocationInputSchema.safeParse({ latitude: 0, longitude: longitude, map: { size: { width: 480, height: 480 } } })
				.success,
		).toBe(false);
	});
});
