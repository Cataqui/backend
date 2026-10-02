import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { AuthService } from "./auth.service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let jwksUrlSequence = 0;

async function _generateKeyMaterial(keyId: string): Promise<{
	keyId: string;
	privateKey: CryptoKey;
	publicJwk: Record<string, unknown>;
}> {
	const keyPair = await generateKeyPair("ES256", { extractable: true });
	const publicKey = await exportJWK(keyPair.publicKey);

	return {
		keyId: keyId,
		privateKey: keyPair.privateKey,
		publicJwk: {
			kty: publicKey.kty,
			crv: publicKey.crv,
			x: publicKey.x,
			y: publicKey.y,
			alg: "ES256",
			kid: keyId,
			use: "sig",
		},
	};
}

async function _signToken(params: {
	audience?: string | undefined;
	expiresInSeconds?: number | undefined;
	extraClaim?: boolean | undefined;
	extraHeader?: boolean | undefined;
	issuedAtSeconds?: number | undefined;
	keyMaterial: Awaited<ReturnType<typeof _generateKeyMaterial>>;
	protectedType?: string | undefined;
	subject?: string | undefined;
}): Promise<string> {
	const issuedAt = params.issuedAtSeconds ?? Math.floor(Date.now() / 1_000);
	const signer = new SignJWT(params.extraClaim ? { role: "ADMIN" } : {})
		.setProtectedHeader({
			alg: "ES256",
			kid: params.keyMaterial.keyId,
			typ: params.protectedType ?? "microservice-access+jwt",
			...(params.extraHeader ? { cty: "JWT" } : {}),
		})
		.setSubject(params.subject ?? userId)
		.setAudience(params.audience ?? "MAPS")
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + (params.expiresInSeconds ?? 600));

	return signer.sign(params.keyMaterial.privateKey);
}

function _mockRemoteJwks(params: { keys: Record<string, unknown>[] }): {
	requestMock: ReturnType<typeof vi.spyOn>;
	url: string;
} {
	jwksUrlSequence += 1;
	const url = `https://api.cataqui.test/v1/auth/microservices/jwks/${jwksUrlSequence}`;
	const requestMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify({ keys: params.keys }), {
			headers: { "Content-Type": "application/jwk-set+json" },
		}),
	);

	return { requestMock: requestMock, url: url };
}

describe("AuthService", () => {
	const service = new AuthService();
	let currentKey: Awaited<ReturnType<typeof _generateKeyMaterial>>;
	let previousKey: Awaited<ReturnType<typeof _generateKeyMaterial>>;

	beforeAll(async () => {
		[currentKey, previousKey] = await Promise.all([_generateKeyMaterial("V1"), _generateKeyMaterial("V0")]);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("should return the user ID from the complete fixed JWT profile", async () => {
		const accessToken = await _signToken({ keyMaterial: currentKey });
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBe(userId);
		expect(remoteJwks.requestMock).toHaveBeenCalledTimes(1);
	});

	it("should reuse fetched keys for subsequent tokens from the same JWKS endpoint", async () => {
		const accessToken = await _signToken({ keyMaterial: currentKey });
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await service.getAuthenticatedUserIdOrNull({
			accessToken: accessToken,
			microservicesAuthJwksUrl: remoteJwks.url,
		});
		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBe(userId);
		expect(remoteJwks.requestMock).toHaveBeenCalledTimes(1);
	});

	it("should accept every published key during rotation overlap", async () => {
		const remoteJwks = _mockRemoteJwks({ keys: [previousKey.publicJwk, currentKey.publicJwk] });

		await expect(
			Promise.all([
				_signToken({ keyMaterial: previousKey }).then((accessToken) =>
					service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
				),
				_signToken({ keyMaterial: currentKey }).then((accessToken) =>
					service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
				),
			]),
		).resolves.toEqual([userId, userId]);
	});

	it.each([
		{ name: "wrong audience", overrides: { audience: "ANOTHER_SERVICE" } },
		{ name: "wrong type", overrides: { protectedType: "JWT" } },
		{ name: "non-UUID subject", overrides: { subject: "user-id" } },
		{ name: "wrong lifetime", overrides: { expiresInSeconds: 601 } },
		{ name: "unexpected claim", overrides: { extraClaim: true } },
		{ name: "unexpected header", overrides: { extraHeader: true } },
	])("should reject a token with $name", async ({ overrides }) => {
		const accessToken = await _signToken({
			audience: overrides.audience,
			expiresInSeconds: overrides.expiresInSeconds,
			extraClaim: overrides.extraClaim,
			extraHeader: overrides.extraHeader,
			keyMaterial: currentKey,
			protectedType: overrides.protectedType,
			subject: overrides.subject,
		});
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should reject an expired token", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
		const accessToken = await _signToken({ keyMaterial: currentKey });
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });
		vi.setSystemTime(new Date("2026-08-22T12:11:00.000Z"));

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should reject an ES256 token whose signature does not match the selected key", async () => {
		const accessToken = await _signToken({
			keyMaterial: {
				keyId: currentKey.keyId,
				privateKey: previousKey.privateKey,
				publicJwk: previousKey.publicJwk,
			},
		});
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should reject an algorithm outside the fixed ES256 profile", async () => {
		const issuedAt = Math.floor(Date.now() / 1_000);
		const accessToken = await new SignJWT({ aud: "MAPS", sub: userId })
			.setProtectedHeader({ alg: "HS256", kid: "V1", typ: "microservice-access+jwt" })
			.setIssuedAt(issuedAt)
			.setExpirationTime(issuedAt + 600)
			.sign(new TextEncoder().encode("a-development-test-signing-key-with-32-bytes"));
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should reject a token issued beyond the clock tolerance", async () => {
		const issuedAt = Math.floor(Date.now() / 1_000);
		const accessToken = await _signToken({ issuedAtSeconds: issuedAt + 6, keyMaterial: currentKey });
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should limit unknown-key refreshes to once every five minutes", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
		const currentAccessToken = await _signToken({ keyMaterial: currentKey });
		const previousAccessToken = await _signToken({ keyMaterial: previousKey });
		const remoteJwks = _mockRemoteJwks({ keys: [currentKey.publicJwk] });

		await service.getAuthenticatedUserIdOrNull({
			accessToken: currentAccessToken,
			microservicesAuthJwksUrl: remoteJwks.url,
		});
		await service.getAuthenticatedUserIdOrNull({
			accessToken: previousAccessToken,
			microservicesAuthJwksUrl: remoteJwks.url,
		});
		expect(remoteJwks.requestMock).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date("2026-08-22T12:05:01.000Z"));
		await service.getAuthenticatedUserIdOrNull({
			accessToken: previousAccessToken,
			microservicesAuthJwksUrl: remoteJwks.url,
		});
		expect(remoteJwks.requestMock).toHaveBeenCalledTimes(2);
	});

	it("should reject malformed JWKS responses without exposing an authentication result", async () => {
		const accessToken = await _signToken({ keyMaterial: currentKey });
		const remoteJwks = _mockRemoteJwks({ keys: [{ kid: "V1" }] });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: remoteJwks.url }),
		).resolves.toBeNull();
	});

	it("should reject an invalid configured JWKS URL", async () => {
		const accessToken = await _signToken({ keyMaterial: currentKey });

		await expect(
			service.getAuthenticatedUserIdOrNull({ accessToken: accessToken, microservicesAuthJwksUrl: "not-a-url" }),
		).rejects.toThrow();
	});
});
