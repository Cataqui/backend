import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createImagePermission, getImagePermissionJwks } from "../../test/image-permission";
import { AuthService } from "./auth.service";

let _service: AuthService;
const _fetch = vi.fn<typeof fetch>();
const _params = { latitude: -23.55, longitude: -46.63, jwksUrl: "https://keys.test/jwks" };
let _token: string;
beforeEach(async () => {
	_service = new AuthService();
	_token = await createImagePermission(_params);
	_fetch.mockReset().mockImplementation(async () => Response.json(await getImagePermissionJwks()));
	vi.stubGlobal("fetch", _fetch);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
function _authorize(authorization = `Bearer ${_token}`, overrides: Partial<typeof _params> = {}) {
	return _service.authorizeImage({ ..._params, ...overrides, authorization: authorization });
}
it("caches keys across distinct non-expiring coordinate permissions", async () => {
	await _authorize();
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2040-01-01"));
	// Restore the same resolver clock age: this is deliberately also a refresh test.
	await _authorize();
	expect(_fetch).toHaveBeenCalledTimes(2);
	await _authorize(`Bearer ${await createImagePermission({ latitude: 0, longitude: 0 })}`, {
		latitude: -0,
		longitude: 0,
	});
	expect(_fetch).toHaveBeenCalledTimes(2);
});
it("reuses fetched keys within the one-hour window", async () => {
	await _authorize();
	await _authorize();
	expect(_fetch).toHaveBeenCalledTimes(1);
});
it.each([undefined, "", "Basic abc", "Bearer a.b.c", "Bearer " + "a".repeat(2050) + ".b.c"])(
	"rejects malformed permission %# before key retrieval",
	async (authorization) => {
		await expect(_service.authorizeImage({ ..._params, authorization: authorization })).rejects.toMatchObject({
			errorCode: "UNAUTHORIZED",
		});
		expect(_fetch).not.toHaveBeenCalled();
	},
);
it("rejects a valid permission for another coordinate", async () => {
	await expect(_authorize(undefined, { latitude: -23.550001 })).rejects.toMatchObject({ errorCode: "FORBIDDEN" });
});
it("sanitizes invalid JWKS configuration", async () => {
	await expect(_authorize(undefined, { jwksUrl: "file:///private" })).rejects.toMatchObject({
		errorCode: "INTERNAL_ERROR",
	});
	expect(_fetch).not.toHaveBeenCalled();
});
it.each(["network", "http", "json", "shape", "key"])("sanitizes %s JWKS failures", async (kind) => {
	_fetch.mockImplementation(async () => {
		if (kind === "network") throw new Error("private endpoint");
		if (kind === "http") return new Response("private", { status: 503 });
		if (kind === "json") return new Response("private");
		if (kind === "shape") return Response.json({ keys: "private" });
		return Response.json({
			keys: [{ kty: "EC", crv: "P-256", alg: "ES256", use: "sig", kid: "V1", x: "bad", y: "bad" }],
		});
	});
	await expect(_authorize()).rejects.toMatchObject({ errorCode: "AUTH_UNAVAILABLE" });
});
it("bounds public-key retrieval with a five-second timeout", async () => {
	_fetch.mockImplementation(
		async (_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			}),
	);
	await expect(_authorize()).rejects.toMatchObject({ errorCode: "AUTH_UNAVAILABLE" });
}, 10000);

it("rejects keys from another environment and throttles unknown key refresh", async () => {
	const foreign = await generateKeyPair("ES256");
	_fetch.mockResolvedValue(Response.json({ keys: [{ ...(await exportJWK(foreign.publicKey)), kid: "V1" }] }));
	await expect(_authorize()).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	_fetch.mockImplementation(async () => Response.json({ keys: [] }));
	_service = new AuthService();
	await expect(_authorize()).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	await expect(_authorize()).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	expect(_fetch).toHaveBeenCalledTimes(2);
});
it.each([
	{ aud: "GEOSEARCH", latitude: -23.55, longitude: -46.63 },
	{ aud: "geoimage", latitude: -23.55, longitude: -46.63, exp: 9999999999 },
	{ aud: "geoimage", latitude: 91, longitude: -46.63 },
])("rejects unrelated claim contracts %# without fetching keys", async (payload) => {
	const pair = await generateKeyPair("ES256");
	const token = await new SignJWT(payload)
		.setProtectedHeader({ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt" })
		.sign(pair.privateKey);
	await expect(_authorize(`Bearer ${token}`)).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	expect(_fetch).not.toHaveBeenCalled();
});
it.each(["wrong-type", "HS256", "none"])("rejects incompatible %s headers without fetching keys", async (kind) => {
	const token = `${btoa(JSON.stringify({ alg: kind === "wrong-type" ? "ES256" : kind, typ: kind === "wrong-type" ? "microservice-access+jwt" : "geoimage-access+jwt", kid: "V1" })).replace(/=/g, "")}.${btoa(JSON.stringify({ aud: "geoimage", latitude: -23.55, longitude: -46.63 })).replace(/=/g, "")}.abc`;
	await expect(_authorize(`Bearer ${token}`)).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	expect(_fetch).not.toHaveBeenCalled();
});
it("rejects a tampered signature", async () => {
	const parts = _token.split(".");
	parts[2] = (parts[2]!.startsWith("A") ? "B" : "A") + parts[2]!.slice(1);
	await expect(_authorize(`Bearer ${parts.join(".")}`)).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
});

it("isolates cached resolvers by configured JWKS URL", async () => {
	await _authorize();
	await _authorize(undefined, { jwksUrl: "https://other.test/jwks" });
	await _authorize();
	expect(_fetch).toHaveBeenCalledTimes(2);
});
it("refreshes an unknown signing key after the five-minute cooldown", async () => {
	vi.useFakeTimers();
	await _authorize();
	const pair = await generateKeyPair("ES256", { extractable: true });
	const token = await new SignJWT({ aud: "geoimage", latitude: -23.55, longitude: -46.63 })
		.setProtectedHeader({ alg: "ES256", kid: "V2", typ: "geoimage-access+jwt" })
		.sign(pair.privateKey);
	_fetch.mockImplementation(async () => Response.json({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "V2" }] }));
	await expect(_authorize(`Bearer ${token}`)).rejects.toMatchObject({ errorCode: "UNAUTHORIZED" });
	expect(_fetch).toHaveBeenCalledTimes(1);
	vi.advanceTimersByTime(5 * 60 * 1000 + 1);
	await _authorize(`Bearer ${token}`);
	expect(_fetch).toHaveBeenCalledTimes(2);
});
