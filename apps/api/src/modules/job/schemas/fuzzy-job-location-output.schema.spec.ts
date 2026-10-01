import { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";

describe("FuzzyJobLocationOutputSchema", () => {
	it("should serialize the public fuzzy location", () => {
		const output = {
			latitude: -23.55,
			longitude: -46.63,
			areaRadius: 2000,
			image: { accessToken: "image-permission" },
		};

		expect(FuzzyJobLocationOutputSchema.parse(output)).toEqual(output);
	});

	it.each(["street", "neighborhood", "city", "state", "country"])("should reject the removed %s field", (field) => {
		expect(() =>
			FuzzyJobLocationOutputSchema.parse({
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2000,
				image: { accessToken: "image-permission" },
				[field]: "legacy",
			}),
		).toThrow();
	});
	it.each([undefined, {}, { accessToken: "" }, { accessToken: "token", privateField: "secret" }])(
		"rejects an absent or invalid image permission %j",
		(image) => {
			expect(
				FuzzyJobLocationOutputSchema.safeParse({ latitude: -23, longitude: -46, areaRadius: 2000, image: image })
					.success,
			).toBe(false);
		},
	);
	it.each([
		{ field: "latitude", value: NaN },
		{ field: "latitude", value: Infinity },
		{ field: "latitude", value: -Infinity },
		{ field: "longitude", value: NaN },
		{ field: "longitude", value: Infinity },
		{ field: "longitude", value: -Infinity },
	])("rejects nonfinite $field ($value) using the number schema", ({ field, value }) => {
		expect(
			FuzzyJobLocationOutputSchema.safeParse({
				latitude: -23,
				longitude: -46,
				areaRadius: 2000,
				image: { accessToken: "image-permission" },
				[field]: value,
			}).success,
		).toBe(false);
	});
});
