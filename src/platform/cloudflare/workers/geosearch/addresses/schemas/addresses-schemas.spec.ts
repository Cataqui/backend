import { AddressDetailsInputSchema } from "./address-details-input.schema";
import { AddressDetailsOutputSchema } from "./address-details-output.schema";
import { AddressSearchInputSchema } from "./address-search-input.schema";
import { AddressSearchOutputSchema } from "./address-search-output.schema";

describe("Addresses schemas", () => {
	it("should trim address searches and accept URL-safe session tokens", () => {
		expect(AddressSearchInputSchema.parse({ query: "  Avenida Paulista  ", sessionToken: "abc_DEF-123" })).toEqual({
			query: "Avenida Paulista",
			sessionToken: "abc_DEF-123",
		});
	});

	it("should accept a blank address search", () => {
		expect(AddressSearchInputSchema.parse({ query: "   ", sessionToken: "session" }).query).toBe("");
	});

	it.each([
		{ query: "A", sessionToken: "a".repeat(37) },
		{ query: "A", sessionToken: "unsafe+token" },
		{ query: "A", sessionToken: "" },
		{ query: "A".repeat(257), sessionToken: "session" },
		{ query: "A", sessionToken: "session", provider: "GOOGLE" },
	])("should reject invalid or provider-specific search input", (input) => {
		expect(AddressSearchInputSchema.safeParse(input).success).toBe(false);
	});

	it("should accept provider-neutral address details input", () => {
		expect(AddressDetailsInputSchema.parse({ addressId: " opaque-id ", sessionToken: "session" })).toEqual({
			addressId: "opaque-id",
			sessionToken: "session",
		});
	});

	it("should accept normalized suggestions with nullable secondary text", () => {
		const output = {
			suggestions: [
				{
					addressId: "address-id",
					fullText: "Avenida Paulista, São Paulo",
					primaryText: "Avenida Paulista",
					secondaryText: null,
				},
			],
			attribution: { text: "Google Maps" },
		};

		expect(AddressSearchOutputSchema.parse(output)).toEqual(output);
	});

	it.each([
		{ latitude: -90, longitude: -180 },
		{ latitude: 90, longitude: 180 },
		{ latitude: -23.5505, longitude: -46.6333 },
	])("should accept coordinates inside geographic bounds", (coordinates) => {
		expect(AddressDetailsOutputSchema.parse(coordinates)).toEqual(coordinates);
	});

	it.each([
		{ latitude: -90.1, longitude: 0 },
		{ latitude: 0, longitude: 180.1 },
	])("should reject coordinates outside geographic bounds", (coordinates) => {
		expect(AddressDetailsOutputSchema.safeParse(coordinates).success).toBe(false);
	});
});
