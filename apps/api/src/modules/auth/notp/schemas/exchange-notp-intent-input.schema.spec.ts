import { ExchangeNotpIntentInputSchema } from "./exchange-notp-intent-input.schema";

describe("ExchangeNotpIntentInputSchema", () => {
	it("should accept the camelCase 256-bit URL-safe intent token", () => {
		expect(
			ExchangeNotpIntentInputSchema.parse({
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			}).intentToken,
		).toBe("kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI");
	});

	it("should reject an intent token that is not the generated 43-character format", () => {
		expect(ExchangeNotpIntentInputSchema.safeParse({ intentToken: "too-short" }).success).toBe(false);
	});
});
