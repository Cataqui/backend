import { RefreshTokenInputSchema } from "./refresh-token-input.schema";

describe("RefreshTokenInputSchema", () => {
	it("should accept the camelCase refresh token", () => {
		expect(RefreshTokenInputSchema.parse({ refreshToken: "r".repeat(43) }).refreshToken).toBe("r".repeat(43));
	});

	it("should accept a bounded opaque token without applying family authentication at the transport boundary", () => {
		expect(RefreshTokenInputSchema.safeParse({ refreshToken: "short" }).success).toBe(true);
	});

	it("should reject an empty refresh token", () => {
		expect(RefreshTokenInputSchema.safeParse({ refreshToken: "" }).success).toBe(false);
	});

	it("should reject a refresh token above the transport safety bound", () => {
		expect(RefreshTokenInputSchema.safeParse({ refreshToken: "r".repeat(513) }).success).toBe(false);
	});
});
