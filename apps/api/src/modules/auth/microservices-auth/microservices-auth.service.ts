import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { GeosearchAccessTokenConstants } from "@cataqui/microservices-auth-schemas/geosearch";
import {
	GeoimageAccessTokenConstants,
	GeoimageAccessTokenPayloadSchema,
} from "@cataqui/microservices-auth-schemas/geoimage";
import {
	MicroservicesAuthJwksOutputSchema,
	MicroservicesAuthJwksConstants,
} from "@cataqui/microservices-auth-schemas/jwks";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { z } from "zod";
import { type IMicroservicesAuthConfig, microservicesAuthConfig } from "./microservices-auth.config";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";

@Injectable()
export class MicroservicesAuthService implements OnModuleInit {
	constructor(@Inject(microservicesAuthConfig.KEY) private readonly _config: IMicroservicesAuthConfig) {}

	private _signingKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;
	private _publicJwks: z.infer<typeof MicroservicesAuthJwksOutputSchema> | undefined;

	async createGeosearchAccessToken(params: {
		userId: string;
	}): Promise<z.infer<typeof MicroserviceAccessTokenOutputSchema>> {
		if (this._signingKey === undefined) throw new Error("The microservice JWT signing key is unavailable");

		const issuedAtEpochSeconds = Math.floor(Date.now() / 1_000);
		const expiresAtEpochSeconds = issuedAtEpochSeconds + GeosearchAccessTokenConstants.LIFETIME_SECONDS;
		const accessToken = await new SignJWT()
			.setProtectedHeader({
				alg: GeosearchAccessTokenConstants.ALGORITHM,
				kid: this._config.signingKeyId,
				typ: GeosearchAccessTokenConstants.TOKEN_TYPE,
			})
			.setSubject(params.userId)
			.setAudience(GeosearchAccessTokenConstants.AUDIENCE)
			.setIssuedAt(issuedAtEpochSeconds)
			.setExpirationTime(expiresAtEpochSeconds)
			.sign(this._signingKey);

		return {
			accessToken: accessToken,
			expiresAt: new Date(expiresAtEpochSeconds * 1_000).toISOString(),
			tokenType: "Bearer",
		};
	}

	async createGeoimageAccessToken(params: { latitude: number; longitude: number }): Promise<string> {
		if (this._signingKey === undefined) throw new Error("The microservice JWT signing key is unavailable");
		const payload = GeoimageAccessTokenPayloadSchema.parse({
			aud: GeoimageAccessTokenConstants.AUDIENCE,
			latitude: params.latitude,
			longitude: params.longitude,
		});
		return new SignJWT(payload)
			.setProtectedHeader({
				alg: GeoimageAccessTokenConstants.ALGORITHM,
				kid: this._config.signingKeyId,
				typ: GeoimageAccessTokenConstants.TOKEN_TYPE,
			})
			.sign(this._signingKey);
	}

	getPublicJwks(): z.infer<typeof MicroservicesAuthJwksOutputSchema> {
		if (this._publicJwks === undefined) throw new Error("The microservice public JWKS is unavailable");

		return this._publicJwks;
	}

	async onModuleInit(): Promise<void> {
		const privateKeyPkcs8Base64 = this._config.privateKeyPkcs8Base64ByKeyId[this._config.signingKeyId];

		if (privateKeyPkcs8Base64 === undefined) {
			throw new Error("The current microservice JWT signing key is unavailable");
		}

		const publicJwks = MicroservicesAuthJwksOutputSchema.parse({
			keys: Object.entries(this._config.privateKeyPkcs8Base64ByKeyId)
				.sort(([firstKeyId], [secondKeyId]) => firstKeyId.localeCompare(secondKeyId))
				.map(([keyId, configuredPrivateKeyPkcs8Base64]) => ({
					...createPublicKey(
						createPrivateKey({
							key: Buffer.from(configuredPrivateKeyPkcs8Base64, "base64"),
							format: "der",
							type: "pkcs8",
						}),
					).export({ format: "jwk" }),
					alg: MicroservicesAuthJwksConstants.ALGORITHM,
					kid: keyId,
					use: MicroservicesAuthJwksConstants.USE,
				})),
		});

		this._signingKey = await importPKCS8(
			`-----BEGIN PRIVATE KEY-----\n${privateKeyPkcs8Base64}\n-----END PRIVATE KEY-----`,
			MicroservicesAuthJwksConstants.ALGORITHM,
		);
		this._publicJwks = publicJwks;
	}
}
