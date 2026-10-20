import { PlaceDetailsOutputSchema } from "./place-details-output.schema";

describe("PlaceDetailsOutputSchema", () => {
	it.each([
		{ latitude: -90, longitude: -180 },
		{ latitude: 90, longitude: 180 },
		{ latitude: -23.5505, longitude: -46.6333 },
	])("should accept coordinates inside geographic bounds", (coordinates) => {
		expect(PlaceDetailsOutputSchema.parse(coordinates)).toEqual(coordinates);
	});

	it.each([
		{ latitude: -90.1, longitude: 0 },
		{ latitude: 0, longitude: 180.1 },
	])("should reject coordinates outside geographic bounds", (coordinates) => {
		expect(PlaceDetailsOutputSchema.safeParse(coordinates).success).toBe(false);
	});
});
