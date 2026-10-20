import { PlaceSearchInputSchema } from "./place-search-input.schema";

describe("PlaceSearchInputSchema", () => {
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
});
