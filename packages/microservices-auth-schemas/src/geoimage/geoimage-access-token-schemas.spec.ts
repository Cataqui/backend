import { GeoimageAccessTokenConstants } from "./geoimage-access-token.constants.js";
import { GeoimageAccessTokenHeaderSchema } from "./geoimage-access-token-header.schema.js";
import { GeoimageAccessTokenPayloadSchema } from "./geoimage-access-token-payload.schema.js";

const _payload = { aud: GeoimageAccessTokenConstants.AUDIENCE, latitude: -23.55, longitude: -46.63 };
it("accepts only coordinates and audience without an expiration", () => {
	expect(GeoimageAccessTokenPayloadSchema.parse(_payload)).toEqual(_payload);
	expect(GeoimageAccessTokenHeaderSchema.parse({ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt" })).toEqual({
		alg: "ES256",
		kid: "V1",
		typ: "geoimage-access+jwt",
	});
});
it.each([
	{ ..._payload, latitude: Infinity },
	{ ..._payload, latitude: 91 },
	{ ..._payload, longitude: -181 },
	{ ..._payload, latitude: "-23.55" },
	{ ..._payload, aud: "GEOSEARCH" },
	{ ..._payload, exp: 123 },
	{ ..._payload, environment: "production" },
	{ ..._payload, longitude: undefined },
])("rejects incompatible coordinate permission claims %#", (payload) => {
	expect(GeoimageAccessTokenPayloadSchema.safeParse(payload).success).toBe(false);
});
it.each([
	{ alg: "none", kid: "V1", typ: "geoimage-access+jwt" },
	{ alg: "ES256", kid: "", typ: "geoimage-access+jwt" },
	{ alg: "ES256", kid: "V1", typ: "microservice-access+jwt" },
	{ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt", jku: "https://untrusted.test" },
])("rejects incompatible permission headers %#", (header) => {
	expect(GeoimageAccessTokenHeaderSchema.safeParse(header).success).toBe(false);
});
