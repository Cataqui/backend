import { MicroserviceAccessTokenConstants } from "./microservice-access-token.constants";
import { MicroserviceAudience } from "./microservice-audience.enum";

describe("MicroserviceAccessTokenConstants", () => {
	it("should expose the complete fixed signing profile", () => {
		expect(MicroserviceAccessTokenConstants).toEqual({
			ALGORITHM: "ES256",
			CURVE: "P-256",
			JWK_KEY_TYPE: "EC",
			JWK_USE: "sig",
			LIFETIME_SECONDS: 600,
			TOKEN_TYPE: "microservice-access+jwt",
		});
	});

	it("should enumerate every supported microservice audience exhaustively", () => {
		expect(Object.values(MicroserviceAudience)).toEqual(["GEOSEARCH"]);
	});
});
