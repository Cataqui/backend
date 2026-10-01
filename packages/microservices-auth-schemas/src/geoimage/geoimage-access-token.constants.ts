import { MicroservicesAuthJwksConstants } from "../jwks/microservices-auth-jwks.constants.js";

export const GeoimageAccessTokenConstants = {
	ALGORITHM: MicroservicesAuthJwksConstants.ALGORITHM,
	AUDIENCE: "geoimage",
	TOKEN_TYPE: "geoimage-access+jwt",
} as const;
