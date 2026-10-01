import fc from "fast-check";
import { JobLocationInputSchema } from "./job-location-input.schema";

function _buildLocationInput(params: { title?: string; latitude?: number; longitude?: number } = {}) {
	return {
		title: params.title ?? "Rua Pardal Branco, 32",
		latitude: params.latitude ?? -23.55052,
		longitude: params.longitude ?? -46.633308,
	};
}

describe("JobLocationInputSchema", () => {
	it("should accept a selected title and coordinates", () => {
		expect(JobLocationInputSchema.parse(_buildLocationInput())).toEqual({
			title: "Rua Pardal Branco, 32",
			latitude: -23.55052,
			longitude: -46.633308,
		});
	});

	it("should trim surrounding whitespace from the selected title", () => {
		expect(JobLocationInputSchema.parse(_buildLocationInput({ title: "  Rua Pardal Branco, 32  " })).title).toBe(
			"Rua Pardal Branco, 32",
		);
	});

	it.each([undefined, "", "   "])("should reject a missing or blank title: %s", (title) => {
		const location = _buildLocationInput();
		expect(JobLocationInputSchema.safeParse({ ...location, title: title }).success).toBe(false);
	});

	it.each(["street", "neighborhood", "city", "state", "country"])("should reject removed %s fields", (field) => {
		expect(JobLocationInputSchema.safeParse({ ..._buildLocationInput(), [field]: "legacy value" }).success).toBe(false);
	});

	it.each(["latitude", "longitude"] as const)("should reject a location without %s", (field) => {
		const location: { title?: string; latitude?: number; longitude?: number } = _buildLocationInput();
		delete location[field];

		expect(JobLocationInputSchema.safeParse(location).success).toBe(false);
	});

	it.each([
		{ latitude: -90, longitude: -180 },
		{ latitude: 90, longitude: 180 },
	])("should accept coordinate boundaries", (location) => {
		expect(JobLocationInputSchema.safeParse({ ..._buildLocationInput(), ...location }).success).toBe(true);
	});

	it.each([
		{ latitude: -90.000001, longitude: 0 },
		{ latitude: 90.000001, longitude: 0 },
		{ latitude: 0, longitude: -180.000001 },
		{ latitude: 0, longitude: 180.000001 },
	])("should reject coordinates outside their valid ranges", (location) => {
		expect(JobLocationInputSchema.safeParse({ ..._buildLocationInput(), ...location }).success).toBe(false);
	});

	it("should accept generated valid coordinates", () => {
		fc.assert(
			fc.property(
				fc.record({
					title: fc.constant("Rua Pardal Branco, 32"),
					latitude: fc.integer({ min: -90_000_000, max: 90_000_000 }).map((value) => value / 1_000_000),
					longitude: fc.integer({ min: -180_000_000, max: 180_000_000 }).map((value) => value / 1_000_000),
				}),
				(location) => {
					expect(JobLocationInputSchema.safeParse(location).success).toBe(true);
				},
			),
		);
	});
});
