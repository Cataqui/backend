import { Test } from "@nestjs/testing";
import { generateKeyPairSync } from "node:crypto";
import { importJWK, importSPKI, jwtVerify } from "jose";
import { type IMicroservicesAuthConfig, microservicesAuthConfig } from "./microservices-auth.config";
import { MicroservicesAuthService } from "./microservices-auth.service";

describe("MicroservicesAuthService", () => {
	const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const { privateKey, publicKey } = generateKeyPairSync("ec", {
		namedCurve: "prime256v1",
		privateKeyEncoding: { format: "der", type: "pkcs8" },
		publicKeyEncoding: { format: "pem", type: "spki" },
	});
	const config: IMicroservicesAuthConfig = {
		signingKeyId: "V1",
		privateKeyPkcs8Base64ByKeyId: { V1: privateKey.toString("base64") },
	};

	async function createService(params: { config?: IMicroservicesAuthConfig } = {}): Promise<MicroservicesAuthService> {
		const module = await Test.createTestingModule({
			providers: [
				MicroservicesAuthService,
				{ provide: microservicesAuthConfig.KEY, useValue: params.config ?? config },
			],
		}).compile();
		const service = module.get(MicroservicesAuthService);
		await service.onModuleInit();

		return service;
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create a geosearch token with the fixed protected header and claims", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-22T15:00:00.000Z"));
		const service = await createService();

		const result = await service.createGeosearchAccessToken({ userId: userId });
		const verified = await jwtVerify(result.accessToken, await importSPKI(publicKey, "ES256"), {
			algorithms: ["ES256"],
			audience: "GEOSEARCH",
			typ: "microservice-access+jwt",
		});

		expect({ header: verified.protectedHeader, payload: verified.payload }).toEqual({
			header: { alg: "ES256", kid: "V1", typ: "microservice-access+jwt" },
			payload: {
				aud: "GEOSEARCH",
				exp: 1_787_411_400,
				iat: 1_787_410_800,
				sub: userId,
			},
		});
	});

	it("should return the exact JWT expiration as an ISO timestamp", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-22T15:00:00.000Z"));
		const service = await createService();

		const result = await service.createGeosearchAccessToken({ userId: userId });

		expect(result).toMatchObject({ tokenType: "Bearer", expiresAt: "2026-08-22T15:10:00.000Z" });
	});

	it("should publish only the public key that verifies issued tokens", async () => {
		const service = await createService();
		const accessToken = await service.createGeosearchAccessToken({ userId: userId });
		const jwks = service.getPublicJwks();
		const publicJwk = jwks.keys[0];
		if (publicJwk === undefined) throw new Error("The test public JWK is unavailable");

		const verified = await jwtVerify(accessToken.accessToken, await importJWK(publicJwk, "ES256"), {
			algorithms: ["ES256"],
			audience: "GEOSEARCH",
			typ: "microservice-access+jwt",
		});

		expect({ jwks: jwks, subject: verified.payload.sub, privateMaterial: "d" in publicJwk }).toEqual({
			jwks: {
				keys: [expect.objectContaining({ alg: "ES256", crv: "P-256", kid: "V1", kty: "EC", use: "sig" })],
			},
			subject: userId,
			privateMaterial: false,
		});
	});

	it("should publish every configured public key in deterministic key-ID order", async () => {
		const { privateKey: previousPrivateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			privateKeyEncoding: { format: "der", type: "pkcs8" },
			publicKeyEncoding: { format: "pem", type: "spki" },
		});
		const service = await createService({
			config: {
				signingKeyId: "V1",
				privateKeyPkcs8Base64ByKeyId: {
					V1: privateKey.toString("base64"),
					V0: previousPrivateKey.toString("base64"),
				},
			},
		});

		expect(service.getPublicJwks().keys.map((publicJwk) => publicJwk.kid)).toEqual(["V0", "V1"]);
		expect(service.getPublicJwks()).toBe(service.getPublicJwks());
	});

	it("should reject malformed private key material during initialization", async () => {
		const malformedConfig: IMicroservicesAuthConfig = {
			...config,
			privateKeyPkcs8Base64ByKeyId: { V1: Buffer.from("not-a-private-key").toString("base64") },
		};

		await expect(createService({ config: malformedConfig })).rejects.toThrow();
	});

	it("should reject a private key that does not use the P-256 curve", async () => {
		const { privateKey: wrongCurvePrivateKey } = generateKeyPairSync("ec", {
			namedCurve: "secp384r1",
			privateKeyEncoding: { format: "der", type: "pkcs8" },
			publicKeyEncoding: { format: "pem", type: "spki" },
		});
		const wrongCurveConfig: IMicroservicesAuthConfig = {
			...config,
			privateKeyPkcs8Base64ByKeyId: { V1: wrongCurvePrivateKey.toString("base64") },
		};

		await expect(createService({ config: wrongCurveConfig })).rejects.toThrow();
	});
});
