import { GeosearchAccessTokenConstants } from "./geosearch-access-token.constants";

describe("GeosearchAccessTokenConstants", () => {
	it("should expose the complete fixed signing profile", () => {
		expect(GeosearchAccessTokenConstants).toEqual({
			ALGORITHM: "ES256",
			AUDIENCE: "GEOSEARCH",
			LIFETIME_SECONDS: 600,
			TOKEN_TYPE: "microservice-access+jwt",
		});
	});
});
