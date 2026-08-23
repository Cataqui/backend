const ALGORITHM = "ES256";
const CURVE = "P-256";
const JWK_KEY_TYPE = "EC";
const JWK_USE = "sig";
const LIFETIME_SECONDS = 10 * 60;
const TOKEN_TYPE = "microservice-access+jwt";

export const MicroserviceAccessTokenConstants = {
	ALGORITHM,
	CURVE,
	JWK_KEY_TYPE,
	JWK_USE,
	LIFETIME_SECONDS,
	TOKEN_TYPE,
} as const;
