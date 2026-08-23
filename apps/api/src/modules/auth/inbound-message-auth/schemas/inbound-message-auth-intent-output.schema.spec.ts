import { InboundMessageAuthIntentOutputSchema } from "./inbound-message-auth-intent-output.schema";

describe("InboundMessageAuthIntentOutputSchema", () => {
	it("should serialize the public authentication intent using camelCase", () => {
		const output = {
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			code: "AUTH-K7F9Q2M8VD",
			codeReceiver: "+5511963270517",
			expiresAt: "2026-08-05T15:15:00.000Z",
		};

		expect(InboundMessageAuthIntentOutputSchema.parse(output)).toEqual(output);
	});
});
