import { MicroservicesAuthJwksConstants } from "./microservices-auth-jwks.constants.js";

it("keeps the shared public-key profile independent of service claims", () => {
	expect(MicroservicesAuthJwksConstants).toEqual({ ALGORITHM: "ES256", CURVE: "P-256", KEY_TYPE: "EC", USE: "sig" });
});
