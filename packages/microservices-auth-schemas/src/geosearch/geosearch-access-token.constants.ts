import { MicroservicesAuthJwksConstants } from "../jwks/microservices-auth-jwks.constants.js";

export const GeosearchAccessTokenConstants = {
	ALGORITHM: MicroservicesAuthJwksConstants.ALGORITHM,
	AUDIENCE: "GEOSEARCH",
	LIFETIME_SECONDS: 10 * 60,
	TOKEN_TYPE: "microservice-access+jwt",
} as const;
