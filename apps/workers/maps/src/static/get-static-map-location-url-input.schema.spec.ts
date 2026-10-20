import { GetStaticMapLocationUrlInputSchema } from "./get-static-map-location-url-input.schema";

describe("static map location URL input", () => {
	it.each([
		{ latitude: -23.5, longitude: -46.6 },
		{ latitude: -85.0511287798066, longitude: -180 },
		{ latitude: 85.0511287798066, longitude: 180 },
	])("accepts representable coordinates without rendering options %j", (input) => {
		expect(GetStaticMapLocationUrlInputSchema.parse(input)).toEqual(input);
	});
	it.each([{ size: { width: 480, height: 480 } }, { density: 1 }, { density: 2 }, { zoom: 12 }])(
		"rejects caller-owned rendering options %j",
		(extra) => {
			expect(GetStaticMapLocationUrlInputSchema.safeParse({ latitude: 0, longitude: 0, ...extra }).success).toBe(false);
		},
	);
	it.each([
		{ latitude: 85.051129, longitude: 0 },
		{ latitude: -85.051129, longitude: 0 },
		{ latitude: 0, longitude: -181 },
		{ latitude: 0, longitude: 181 },
		{ latitude: NaN, longitude: 0 },
		{ latitude: Infinity, longitude: 0 },
		{ latitude: -Infinity, longitude: 0 },
		{ latitude: 0, longitude: NaN },
		{ latitude: 0, longitude: Infinity },
		{ latitude: 0, longitude: -Infinity },
		{ latitude: "0", longitude: 0 },
		{ longitude: 0 },
		{ latitude: 0 },
	])("rejects coordinates outside the finite Web Mercator range %j", (input) => {
		expect(GetStaticMapLocationUrlInputSchema.safeParse(input).success).toBe(false);
	});
});
