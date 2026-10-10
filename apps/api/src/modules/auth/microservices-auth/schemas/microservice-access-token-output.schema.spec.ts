import { MicroserviceAccessTokenOutputSchema } from "./microservice-access-token-output.schema";

describe("MicroserviceAccessTokenOutputSchema", () => {
	it("should accept the maps bearer-token response", () => {
		expect(
			MicroserviceAccessTokenOutputSchema.safeParse({
				accessToken: "header.payload.signature",
				expiresAt: "2026-08-22T15:10:00.000Z",
				tokenType: "Bearer",
			}).success,
		).toBe(true);
	});

	it("should reject additional response fields", () => {
		expect(
			MicroserviceAccessTokenOutputSchema.safeParse({
				accessToken: "header.payload.signature",
				expiresAt: "2026-08-22T15:10:00.000Z",
				tokenType: "Bearer",
				userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			}).success,
		).toBe(false);
	});
});
