import { CurrentAuthSessionOutputSchema } from "./current-auth-session-output.schema";

describe("CurrentAuthSessionOutputSchema", () => {
	it("should serialize the authenticated session using camelCase", () => {
		const output = {
			sessionId: "74d0153b-c07b-4890-b479-16c4a24db1d6",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
			expiresAt: "2026-09-04T15:00:00.000Z",
		};

		expect(CurrentAuthSessionOutputSchema.parse(output)).toEqual(output);
	});
});
