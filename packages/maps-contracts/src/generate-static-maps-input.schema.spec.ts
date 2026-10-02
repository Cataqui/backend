import { GenerateStaticMapsInputSchema } from "./generate-static-maps-input.schema.js";

describe("generation input", () => {
	it("accepts coordinates without rendering options", () => {
		expect(GenerateStaticMapsInputSchema.parse({ latitude: -23.5, longitude: -46.6 })).toEqual({
			latitude: -23.5,
			longitude: -46.6,
		});
	});
	it.each([{ size: { width: 480, height: 480 } }, { density: 1 }, { density: 2 }])(
		"rejects caller-owned rendering options %j",
		(extra) => {
			expect(GenerateStaticMapsInputSchema.safeParse({ latitude: 0, longitude: 0, ...extra }).success).toBe(false);
		},
	);
	it.each([
		{ latitude: 91, longitude: 0 },
		{ latitude: 0, longitude: -181 },
		{ latitude: NaN, longitude: 0 },
	])("rejects invalid coordinates %j", (input) => {
		expect(GenerateStaticMapsInputSchema.safeParse(input).success).toBe(false);
	});
});
