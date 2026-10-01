import { GeosearchAccessTokenConstants } from "./geosearch-access-token.constants";
import { GeosearchAccessTokenHeaderSchema } from "./geosearch-access-token-header.schema";
import { GeosearchAccessTokenPayloadSchema } from "./geosearch-access-token-payload.schema";

describe("microservice access-token input schemas", () => {
	it("should accept the complete protected header", () => {
		expect(
			GeosearchAccessTokenHeaderSchema.safeParse({
				alg: GeosearchAccessTokenConstants.ALGORITHM,
				kid: "V1",
				typ: GeosearchAccessTokenConstants.TOKEN_TYPE,
			}).success,
		).toBe(true);
	});

	it("should reject a protected header outside the fixed profile", () => {
		expect(GeosearchAccessTokenHeaderSchema.safeParse({ alg: "RS256", kid: "V1", typ: "JWT" }).success).toBe(false);
	});

	it("should accept an owned audience and UUID subject", () => {
		expect(
			GeosearchAccessTokenPayloadSchema.safeParse({
				aud: GeosearchAccessTokenConstants.AUDIENCE,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(true);
	});

	it("should reject an unsupported audience", () => {
		expect(
			GeosearchAccessTokenPayloadSchema.safeParse({
				aud: "UNSUPPORTED_SERVICE",
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject an unsupported token lifetime", () => {
		expect(
			GeosearchAccessTokenPayloadSchema.safeParse({
				aud: GeosearchAccessTokenConstants.AUDIENCE,
				exp: 1_659,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject unsupported claims", () => {
		expect(
			GeosearchAccessTokenPayloadSchema.safeParse({
				aud: GeosearchAccessTokenConstants.AUDIENCE,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				role: "ADMIN",
			}).success,
		).toBe(false);
	});
});

it("rejects Geoimage permissions as Geosearch tokens", () => {
	expect(
		GeosearchAccessTokenHeaderSchema.safeParse({ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt" }).success,
	).toBe(false);
	expect(
		GeosearchAccessTokenPayloadSchema.safeParse({ aud: "geoimage", latitude: -23.55, longitude: -46.63 }).success,
	).toBe(false);
});
