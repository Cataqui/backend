import { MapSizeSchema } from "./map-size.schema";

describe("MapSizeSchema", () => {
	it.each([
		{ width: 480, height: 1280 },
		{ width: 480, height: 480 },
	])("accepts logical size %j", (size) => {
		expect(MapSizeSchema.parse(size)).toEqual(size);
	});

	it.each([
		undefined,
		null,
		"480x1280",
		{},
		{ width: 480 },
		{ width: "480", height: 1280 },
		{ width: 480, height: "1280" },
		{ width: 480.5, height: 1280 },
		{ width: 480, height: 480.5 },
		{ width: 0, height: 0 },
		{ width: -480, height: 1280 },
		{ width: Infinity, height: 1280 },
		{ width: 480, height: NaN },
		{ width: 400, height: 800 },
		{ width: 960, height: 2560 },
		{ width: 960, height: 960 },
		{ width: 1280, height: 480 },
		{ width: 480, height: 960 },
		{ width: 480, height: 480, name: "profile" },
	])("rejects unsupported logical size %j", (size) => {
		expect(MapSizeSchema.safeParse(size).success).toBe(false);
	});
});
