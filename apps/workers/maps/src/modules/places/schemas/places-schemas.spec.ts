import { PlaceAreaSearchOutputSchema } from "./place-area-search-output.schema";
import { PlaceCategory } from "../place-category";
import { PlaceDetailsInputSchema } from "./place-details-input.schema";
import { PlaceDetailsOutputSchema } from "./place-details-output.schema";
import { PlaceSearchInputSchema } from "./place-search-input.schema";
import { PlaceSearchOutputSchema } from "./place-search-output.schema";

describe("Places schemas", () => {
	it("should trim place searches and accept URL-safe session tokens", () => {
		expect(PlaceSearchInputSchema.parse({ query: "  Avenida Paulista  ", sessionToken: "abc_DEF-123" })).toEqual({
			query: "Avenida Paulista",
			sessionToken: "abc_DEF-123",
		});
	});

	it("should accept a blank place search", () => {
		expect(PlaceSearchInputSchema.parse({ query: "   ", sessionToken: "session" }).query).toBe("");
	});

	it.each([
		{ query: "A", sessionToken: "a".repeat(37) },
		{ query: "A", sessionToken: "unsafe+token" },
		{ query: "A", sessionToken: "" },
		{ query: "A".repeat(257), sessionToken: "session" },
		{ query: "A", sessionToken: "session", provider: "GOOGLE" },
	])("should reject invalid or provider-specific search input", (input) => {
		expect(PlaceSearchInputSchema.safeParse(input).success).toBe(false);
	});

	it("should accept provider-neutral place details input", () => {
		expect(PlaceDetailsInputSchema.parse({ placeId: " opaque-id ", sessionToken: "session" })).toEqual({
			placeId: "opaque-id",
			sessionToken: "session",
		});
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

it.each([
	PlaceCategory.ATTRACTION,
	PlaceCategory.ZOO,
	PlaceCategory.MUSEUM,
	PlaceCategory.SUPERMARKET,
	PlaceCategory.STORE,
])("accepts shared place category %s in the public search contract", (category) => {
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

describe("PlaceAreaSearchOutputSchema", () => {
	const place = {
		name: "Carrefour",
		category: PlaceCategory.SUPERMARKET,
		coordinates: { latitude: -23.55, longitude: -46.63 },
		notable: false,
	};

	it("accepts an empty area search", () => {
		expect(PlaceAreaSearchOutputSchema.parse([])).toEqual([]);
	});

	it("accepts normalized places with and without a brand", () => {
		const output = [place, { ...place, brand: "Carrefour" }];
		expect(PlaceAreaSearchOutputSchema.parse(output)).toEqual(output);
	});

	it.each([
		{ ...place, name: "" },
		{ ...place, category: "PROVIDER_CATEGORY" },
		{ ...place, notable: "yes" },
		{ ...place, brand: 123 },
		{ ...place, coordinates: { latitude: 91, longitude: 0 } },
		{ ...place, coordinates: { latitude: 0, longitude: -181 } },
		{ ...place, coordinates: { latitude: 0, longitude: 0, provider: "Geoapify" } },
		{ ...place, datasource: {} },
	])("rejects invalid or provider-specific area-search output %j", (invalidPlace) => {
		expect(PlaceAreaSearchOutputSchema.safeParse([invalidPlace]).success).toBe(false);
	});
});
