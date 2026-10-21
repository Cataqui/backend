import { PlaceCategory } from "@cataqui/places";
import { PlaceSearchOutputSchema, type PlaceSearchOutput } from "./place-search-output.schema";

describe("PlaceSearchOutputSchema", () => {
	it("preserves the category type in public suggestions", () => {
		expectTypeOf<PlaceSearchOutput["suggestions"][number]["category"]>().toEqualTypeOf<PlaceCategory>();
	});
	it("should accept normalized suggestions with nullable secondary text", () => {
		const output = {
			suggestions: [
				{
					placeId: "place-id",
					fullText: "Avenida Paulista, São Paulo",
					primaryText: "Avenida Paulista",
					secondaryText: null,
					category: "STREET",
				},
			],
			attribution: { text: "Google Maps" },
		};

		expect(PlaceSearchOutputSchema.parse(output)).toEqual(output);
	});

	it("should reject suggestions with unsupported normalized categories", () => {
		expect(
			PlaceSearchOutputSchema.safeParse({
				suggestions: [
					{
						placeId: "place-id",
						fullText: "Avenida Paulista, São Paulo",
						primaryText: "Avenida Paulista",
						secondaryText: null,
						category: "GOOGLE_PROVIDER_CATEGORY",
					},
				],
				attribution: { text: "Google Maps" },
			}).success,
		).toBe(false);
	});

	it.each(PlaceCategory.values)("accepts shared place category %s in the public search contract", (category) => {
		expect(
			PlaceSearchOutputSchema.parse({
				suggestions: [
					{
						placeId: "place-id",
						fullText: "Known place",
						primaryText: "Known place",
						secondaryText: null,
						category: category,
					},
				],
				attribution: { text: "Google Maps" },
			}).suggestions[0]?.category,
		).toBe(category);
	});
});
