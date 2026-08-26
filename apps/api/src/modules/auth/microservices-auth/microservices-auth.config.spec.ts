import { microservicesAuthConfig } from "./microservices-auth.config";

describe("microservicesAuthConfig", () => {
	it("should map the private key under the code-owned current key ID", () => {
		vi.stubEnv("MICROSERVICES_AUTH_JWT_PRIVATE_KEY_V1_PKCS8_BASE64", "private-key");

		expect(microservicesAuthConfig()).toEqual({
			signingKeyId: "V1",
			privateKeyPkcs8Base64ByKeyId: { V1: "private-key" },
		});
	});
});
