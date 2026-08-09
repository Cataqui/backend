import { AuthSessionOutputSchema } from "./auth-session-output.schema";

describe("AuthSessionOutputSchema", () => {
	it("should serialize the opaque bearer session using camelCase", () => {
		const output = {
			accessToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			tokenType: "Bearer",
			expiresAt: "2026-08-05T15:15:00.000Z",
			refreshToken: "rt1.current.4963fef0-b62a-4760-9f99-675fdc42a896.random-secret.signature",
			refreshExpiresAt: "2026-09-04T15:00:00.000Z",
			userId: "4963fef0-b62a-4760-9f99-675fdc42a896",
		};

		expect(AuthSessionOutputSchema.parse(output)).toEqual(output);
	});
});
