import { MicroservicesAuthJwksConstants } from "../jwks/microservices-auth-jwks.constants.js";

export const MapsAccessTokenConstants = {
	ALGORITHM: MicroservicesAuthJwksConstants.ALGORITHM,
	AUDIENCE: "MAPS",
	LIFETIME_SECONDS: 10 * 60,
	TOKEN_TYPE: "microservice-access+jwt",
} as const;
