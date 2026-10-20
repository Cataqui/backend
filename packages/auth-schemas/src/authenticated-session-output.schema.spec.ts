import { AuthenticatedSessionOutputSchema, type AuthenticatedSession } from "./authenticated-session-output.schema";

describe("AuthenticatedSessionOutputSchema", () => {
	it("serializes only the shared authentication session context", () => {
		const session = {
			accountId: "4963fef0-b62a-4760-9f99-675fdc42a896",
			sessionId: "74d0153b-c07b-4890-b479-16c4a24db1d6",
			expiresAt: "2026-10-19T15:00:00.000Z",
		} satisfies AuthenticatedSession;
		expect(AuthenticatedSessionOutputSchema.parse(session)).toEqual(session);
	});
	it.each([
		{ accountId: "forged" },
		{ sessionId: "forged" },
		{ expiresAt: "invalid" },
		{ accessToken: "private credential" },
	])("rejects invalid or undeclared context fields %j", (override) => {
		expect(
			AuthenticatedSessionOutputSchema.safeParse({
				accountId: "4963fef0-b62a-4760-9f99-675fdc42a896",
				sessionId: "74d0153b-c07b-4890-b479-16c4a24db1d6",
				expiresAt: "2026-10-19T15:00:00.000Z",
				...override,
			}).success,
		).toBe(false);
	});
});
