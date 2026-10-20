import { inject, injectable } from "tsyringe";
import { Buffer } from "node:buffer";
import type { GetStaticMapLocationUrlInput } from "./get-static-map-location-url-input.schema";
import type { GetStaticMapLocationUrlOutput } from "./get-static-map-location-url-output.schema";
import { StaticConfig } from "./static.config";
import { StaticReferencePayloadSchema, type StaticReferencePayload } from "./static-reference-payload.schema";

@injectable()
export class LocationReferenceService {
	constructor(@inject(StaticConfig) private readonly _config: StaticConfig) {}

	async createUrl(location: GetStaticMapLocationUrlInput): Promise<GetStaticMapLocationUrlOutput> {
		const payload = {
			version: 1,
			environment: this._config.environment,
			center: { latitude: location.latitude, longitude: location.longitude },
		} satisfies StaticReferencePayload;
		const bytes = new TextEncoder().encode(JSON.stringify(payload));
		const signature = await crypto.subtle.sign("HMAC", await this._importKey(), bytes);
		const reference = Buffer.concat([bytes, Buffer.from(signature)]).toString("base64url");
		return { url: new URL(`/static/v1/${reference}.webp`, this._config.baseUrl).toString() };
	}

	async read(reference: string): Promise<GetStaticMapLocationUrlInput | null> {
		const bytes = Uint8Array.from(Buffer.from(reference, "base64url"));
		const isCanonicalReference = bytes.length > 32 && Buffer.from(bytes).toString("base64url") === reference;
		if (!isCanonicalReference) return null;
		const payloadBytes = bytes.slice(0, -32);
		const signatureIsValid = await crypto.subtle.verify(
			"HMAC",
			await this._importKey(),
			bytes.slice(-32),
			payloadBytes,
		);
		if (!signatureIsValid) return null;

		let payload: unknown;
		try {
			payload = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(payloadBytes));
		} catch {
			return null;
		}
		const parsed = StaticReferencePayloadSchema.safeParse(payload);
		if (!parsed.success) return null;
		const matchesEnvironment = parsed.data.environment === this._config.environment;
		if (!matchesEnvironment) return null;
		return { latitude: parsed.data.center.latitude, longitude: parsed.data.center.longitude };
	}

	private _importKey(): Promise<CryptoKey> {
		return crypto.subtle.importKey(
			"raw",
			Uint8Array.from(Buffer.from(this._config.signingKey, "base64url")),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign", "verify"],
		);
	}
}
