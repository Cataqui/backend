import { ExchangeInboundMessageAuthIntentInputSchema } from "./exchange-inbound-message-auth-intent-input.schema";

describe("ExchangeInboundMessageAuthIntentInputSchema", () => {
	it("should accept the camelCase 256-bit URL-safe intent token", () => {
		expect(
			ExchangeInboundMessageAuthIntentInputSchema.parse({
				intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			}).intentToken,
		).toBe("kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI");
	});

	it("should reject an intent token that is not the generated 43-character format", () => {
		expect(ExchangeInboundMessageAuthIntentInputSchema.safeParse({ intentToken: "too-short" }).success).toBe(false);
	});
});
