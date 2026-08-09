import { JobLocationOutputSchema } from "./job-location-output.schema";

describe("JobLocationOutputSchema", () => {
	it("should serialize the public fuzzy location", () => {
		const output = {
			neighborhood: "Centro",
			city: "São Paulo",
			state: "SP",
			country: "BR",
			latitude: -23.55,
			longitude: -46.63,
			areaRadius: 2000,
		};

		expect(JobLocationOutputSchema.parse(output)).toEqual(output);
	});

	it("should reject the private street field", () => {
		expect(() =>
			JobLocationOutputSchema.parse({
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
				street: "Rua privada",
			}),
		).toThrow();
	});
});
