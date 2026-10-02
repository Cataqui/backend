import { MapsAccessTokenConstants } from "./maps-access-token.constants";
import { MapsAccessTokenHeaderSchema } from "./maps-access-token-header.schema";
import { MapsAccessTokenPayloadSchema } from "./maps-access-token-payload.schema";

describe("microservice access-token input schemas", () => {
	it("should accept the complete protected header", () => {
		expect(
			MapsAccessTokenHeaderSchema.safeParse({
				alg: MapsAccessTokenConstants.ALGORITHM,
				kid: "V1",
				typ: MapsAccessTokenConstants.TOKEN_TYPE,
			}).success,
		).toBe(true);
	});

	it("should reject a protected header outside the fixed profile", () => {
		expect(MapsAccessTokenHeaderSchema.safeParse({ alg: "RS256", kid: "V1", typ: "JWT" }).success).toBe(false);
	});

	it("should accept an owned audience and UUID subject", () => {
		expect(
			MapsAccessTokenPayloadSchema.safeParse({
				aud: MapsAccessTokenConstants.AUDIENCE,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(true);
	});

	it("should reject an unsupported audience", () => {
		expect(
			MapsAccessTokenPayloadSchema.safeParse({
				aud: "UNSUPPORTED_SERVICE",
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject an unsupported token lifetime", () => {
		expect(
			MapsAccessTokenPayloadSchema.safeParse({
				aud: MapsAccessTokenConstants.AUDIENCE,
				exp: 1_659,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject unsupported claims", () => {
		expect(
			MapsAccessTokenPayloadSchema.safeParse({
				aud: MapsAccessTokenConstants.AUDIENCE,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				role: "ADMIN",
			}).success,
		).toBe(false);
	});
});

it("rejects Geoimage permissions as Maps tokens", () => {
	expect(MapsAccessTokenHeaderSchema.safeParse({ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt" }).success).toBe(
		false,
	);
	expect(MapsAccessTokenPayloadSchema.safeParse({ aud: "geoimage", latitude: -23.55, longitude: -46.63 }).success).toBe(
		false,
	);
});
