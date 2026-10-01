import { exportJWK, generateKeyPair, SignJWT } from "jose";

let _keys: ReturnType<typeof generateKeyPair> | undefined;
function _getKeys() {
	_keys ??= generateKeyPair("ES256", { extractable: true });
	return _keys;
}
export async function getImagePermissionJwks() {
	const keys = await _getKeys();
	return { keys: [{ ...(await exportJWK(keys.publicKey)), kid: "V1", alg: "ES256", use: "sig" }] };
}
export async function createImagePermission(params: { latitude: number; longitude: number }): Promise<string> {
	const keys = await _getKeys();
	return new SignJWT({ aud: "geoimage", latitude: params.latitude, longitude: params.longitude })
		.setProtectedHeader({ alg: "ES256", kid: "V1", typ: "geoimage-access+jwt" })
		.sign(keys.privateKey);
}
export async function permissionHeadersForUrl(url: string): Promise<{ Authorization: string }> {
	const query = new URL(url).searchParams;
	return {
		Authorization: `Bearer ${await createImagePermission({ latitude: Number(query.get("latitude")), longitude: Number(query.get("longitude")) })}`,
	};
}
