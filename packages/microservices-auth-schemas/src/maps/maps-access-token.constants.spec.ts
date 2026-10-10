import { MapsAccessTokenConstants } from "./maps-access-token.constants";

describe("MapsAccessTokenConstants", () => {
	it("should expose the complete fixed signing profile", () => {
		expect(MapsAccessTokenConstants).toEqual({
			ALGORITHM: "ES256",
			AUDIENCE: "MAPS",
			LIFETIME_SECONDS: 600,
			TOKEN_TYPE: "microservice-access+jwt",
		});
	});
});
