import { authConfig } from "./auth.config";

const VALID_KEY = Buffer.alloc(32, 1).toString("base64url");

describe("authConfig", () => {
	it("should map the validated environment key under the code-owned current key ID", () => {
		vi.stubEnv("AUTH_REFRESH_TOKEN_HMAC_KEY_V1_BASE64URL", VALID_KEY);

		expect(authConfig()).toEqual({
			refreshTokenHmacCurrentKid: "V1",
			refreshTokenHmacKeys: { V1: VALID_KEY },
		});
	});
});
