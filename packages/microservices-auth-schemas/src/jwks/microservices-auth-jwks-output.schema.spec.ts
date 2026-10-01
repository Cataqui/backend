import { MicroservicesAuthJwksOutputSchema } from "./microservices-auth-jwks-output.schema";

describe("MicroservicesAuthJwksOutputSchema", () => {
	const publicJwk = {
		alg: "ES256",
		crv: "P-256",
		kid: "V1",
		kty: "EC",
		use: "sig",
		x: "A".repeat(43),
		y: "B".repeat(43),
	};

	it("should accept a public P-256 signing key", () => {
		expect(MicroservicesAuthJwksOutputSchema.parse({ keys: [publicJwk] })).toEqual({ keys: [publicJwk] });
	});

	it("should reject duplicate key IDs", () => {
		expect(MicroservicesAuthJwksOutputSchema.safeParse({ keys: [publicJwk, publicJwk] }).success).toBe(false);
	});

	it.each([
		{ ...publicJwk, crv: "P-384" },
		{ ...publicJwk, alg: "RS256" },
		{ ...publicJwk, use: "enc" },
		{ ...publicJwk, x: "not-base64url+" },
		{ ...publicJwk, d: "private-material" },
	])("should reject an unusable or private JWK", (key) => {
		expect(MicroservicesAuthJwksOutputSchema.safeParse({ keys: [key] }).success).toBe(false);
	});
});
