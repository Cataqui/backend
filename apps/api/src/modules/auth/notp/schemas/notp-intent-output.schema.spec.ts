import { NotpIntentOutputSchema } from "./notp-intent-output.schema";

describe("NotpIntentOutputSchema", () => {
	it("should serialize the public NOTP intent using camelCase", () => {
		const output = {
			intentToken: "kJ3YFf0SYkZp6gWlMTq3up5ELXWRw_zTuF8j0M5tJgI",
			code: "NOTP-K7F9Q2M8VD",
			codeReceiver: "+5511963270517",
			expiresAt: "2026-08-05T15:15:00.000Z",
		};

		expect(NotpIntentOutputSchema.parse(output)).toEqual(output);
	});
});
