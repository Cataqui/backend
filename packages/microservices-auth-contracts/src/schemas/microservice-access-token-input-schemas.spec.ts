import { MicroserviceAccessTokenConstants } from "../microservice-access-token.constants";
import { MicroserviceAudience } from "../microservice-audience.enum";
import { MicroserviceAccessTokenHeaderInputSchema } from "./microservice-access-token-header-input.schema";
import { MicroserviceAccessTokenPayloadInputSchema } from "./microservice-access-token-payload-input.schema";

describe("microservice access-token input schemas", () => {
	it("should accept the complete protected header", () => {
		expect(
			MicroserviceAccessTokenHeaderInputSchema.safeParse({
				alg: MicroserviceAccessTokenConstants.ALGORITHM,
				kid: "V1",
				typ: MicroserviceAccessTokenConstants.TOKEN_TYPE,
			}).success,
		).toBe(true);
	});

	it("should reject a protected header outside the fixed profile", () => {
		expect(MicroserviceAccessTokenHeaderInputSchema.safeParse({ alg: "RS256", kid: "V1", typ: "JWT" }).success).toBe(
			false,
		);
	});

	it("should accept an owned audience and UUID subject", () => {
		expect(
			MicroserviceAccessTokenPayloadInputSchema.safeParse({
				aud: MicroserviceAudience.GEOSEARCH,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(true);
	});

	it("should reject an unsupported audience", () => {
		expect(
			MicroserviceAccessTokenPayloadInputSchema.safeParse({
				aud: "UNSUPPORTED_SERVICE",
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject an unsupported token lifetime", () => {
		expect(
			MicroserviceAccessTokenPayloadInputSchema.safeParse({
				aud: MicroserviceAudience.GEOSEARCH,
				exp: 1_659,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});

	it("should reject unsupported claims", () => {
		expect(
			MicroserviceAccessTokenPayloadInputSchema.safeParse({
				aud: MicroserviceAudience.GEOSEARCH,
				exp: 1_660,
				iat: 1_060,
				sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				role: "ADMIN",
			}).success,
		).toBe(false);
	});
});
