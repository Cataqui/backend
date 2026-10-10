import type { StaticSize } from "./static-outputs";
import type { GenerateStaticMapsInput } from "@cataqui/maps-contracts";
import { StaticEncoding } from "./static-encoding";

export async function getStaticGenerationIdentity(params: {
	input: GenerateStaticMapsInput;
	environment: string;
}): Promise<string> {
	return _identity([StaticEncoding.revision, params.environment, params.input.latitude, params.input.longitude]);
}

export async function getStaticIdentity(params: {
	assetId: string;
	size: StaticSize;
	scale: number;
	zoom: number;
}): Promise<string> {
	return _identity([params.assetId, params.size.width, params.size.height, params.scale, params.zoom]);
}

async function _identity(values: readonly (string | number)[]): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
	return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
