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
