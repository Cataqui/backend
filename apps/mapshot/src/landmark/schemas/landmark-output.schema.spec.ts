import { PlaceCategory } from "@cataqui/places";
import { LandmarkOutputSchema, type LandmarkOutput } from "./landmark-output.schema";

it("keeps the landmark category contract independent of category methods", () => {
	expectTypeOf<LandmarkOutput["category"]>().toEqualTypeOf<PlaceCategory>();
});

it.each(["fromGoogle", "fromProtomaps", "values"])("rejects category API member %s as a category", (category) => {
	expect(LandmarkOutputSchema.safeParse({ ..._landmark, category: category }).success).toBe(false);
});

const _landmark = {
	id: "park",
	label: "",
	alternativeLabels: ["དཔེ་མཛོད་ཁང་།", "東京 公園"],
	category: PlaceCategory.PARK,
	coordinates: { latitude: 29.65, longitude: 91.1 },
	sourceMinZoom: null,
	rank: 0,
};

it("preserves genuine provider names when the preferred source name is absent", () => {
	expect(LandmarkOutputSchema.parse(_landmark)).toEqual(_landmark);
});

it.each([undefined, [], [" "]])("rejects a landmark with no meaningful source name: %j", (alternativeLabels) => {
	expect(LandmarkOutputSchema.safeParse({ ..._landmark, alternativeLabels: alternativeLabels }).success).toBe(false);
});

it("allows a primary name without additional provider alternatives", () => {
	expect(
		LandmarkOutputSchema.parse({ ..._landmark, label: "Parque", alternativeLabels: [] }).alternativeLabels,
	).toEqual([]);
});

it("requires the producer to supply its alternatives array even with a primary name", () => {
	const { alternativeLabels: _alternatives, ...withoutAlternatives } = _landmark;
	expect(LandmarkOutputSchema.safeParse({ ...withoutAlternatives, label: "Parque" }).success).toBe(false);
});

it.each([null, 11, 17])("preserves provider display scale without inventing importance: %j", (sourceMinZoom) => {
	expect(LandmarkOutputSchema.parse({ ..._landmark, sourceMinZoom: sourceMinZoom }).sourceMinZoom).toBe(sourceMinZoom);
});
