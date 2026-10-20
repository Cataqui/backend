import { AuthenticatedSessionOutputSchema } from "@cataqui/auth-schemas";
import { RefreshTokenInputSchema } from "./refresh-token-input.schema";
import { SessionOutputSchema } from "./session-output.schema";

describe("session contracts", () => {
	it("accepts complete issued credentials with an Auth account identifier", () => {
		expect(
			SessionOutputSchema.safeParse({
				accessToken: "a".repeat(43),
				tokenType: "Bearer",
				expiresAt: "2026-10-19T12:15:00.000Z",
				refreshToken: "opaque-refresh-token",
				refreshExpiresAt: "2026-11-18T12:00:00.000Z",
				accountId: "6c64c609-d3ab-4826-9b7d-8ac248207eb7",
			}).success,
		).toBe(true);
	});

	it("serializes only current session identity and expiry", () => {
		expect(
			AuthenticatedSessionOutputSchema.safeParse({
				accountId: "6c64c609-d3ab-4826-9b7d-8ac248207eb7",
				sessionId: "c45a5cd1-074d-4ed9-993f-0d3862e0b211",
				expiresAt: "2026-10-19T12:15:00.000Z",
			}).success,
		).toBe(true);
	});

	it("accepts the opaque refresh credential as ingress input", () => {
		expect(RefreshTokenInputSchema.parse({ refreshToken: "opaque-refresh-token" })).toEqual({
			refreshToken: "opaque-refresh-token",
		});
	});

	it.each(["", "a".repeat(513), 123, null])("rejects an invalid refresh credential: %s", (refreshToken) => {
		expect(RefreshTokenInputSchema.safeParse({ refreshToken: refreshToken }).success).toBe(false);
	});

	it("rejects unexpected caller fields", () => {
		expect(RefreshTokenInputSchema.safeParse({ refreshToken: "token", accountId: "caller-chosen" }).success).toBe(
			false,
		);
	});
});
