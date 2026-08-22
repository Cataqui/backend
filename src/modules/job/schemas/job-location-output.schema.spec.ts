import { JobLocationOutputSchema } from "./job-location-output.schema";

describe("JobLocationOutputSchema", () => {
	it("should serialize the public fuzzy location", () => {
		const output = {
			latitude: -23.55,
			longitude: -46.63,
			areaRadius: 2000,
		};

		expect(JobLocationOutputSchema.parse(output)).toEqual(output);
	});

	it.each(["street", "neighborhood", "city", "state", "country"])("should reject the removed %s field", (field) => {
		expect(() =>
			JobLocationOutputSchema.parse({
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
				[field]: "legacy",
			}),
		).toThrow();
	});
});
