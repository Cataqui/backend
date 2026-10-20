import { createHash, createHmac } from "node:crypto";
import { TokenService } from "./token.service";

const SESSION_ID = "5c474828-dd9e-4490-a45a-0e82512bc45e";
const CURRENT_KEY = Buffer.alloc(32, 1).toString("base64url");
const PREVIOUS_KEY = Buffer.alloc(32, 2).toString("base64url");

function _createService(config?: ConstructorParameters<typeof TokenService>[0]): TokenService {
	return new TokenService(
		config ?? {
			refreshTokenHmacCurrentKid: "current",
			refreshTokenHmacKeys: { current: CURRENT_KEY, previous: PREVIOUS_KEY },
		},
	);
}

function _createTokenWithKey(params: { key: string; keyId: string; randomSecret: string }): string {
	const unsignedToken = `rt1.${params.keyId}.${SESSION_ID}.${params.randomSecret}`;
	return `${unsignedToken}.${createHmac("sha256", Buffer.from(params.key, "base64url"))
		.update(unsignedToken)
		.digest("base64url")}`;
}

describe("TokenService", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("should issue a 256-bit opaque access token", () => {
		const tokens = _createService().createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect(tokens.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("should return the SHA-256 hash of the issued access token", () => {
		const tokens = _createService().createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect(tokens.accessTokenHash).toBe(createHash("sha256").update(tokens.accessToken).digest("hex"));
	});

	it("should hash access tokens without depending on session state", () => {
		expect(_createService().hashAccessToken({ accessToken: "opaque-access-token" })).toBe(
			createHash("sha256").update("opaque-access-token").digest("hex"),
		);
	});

	it("should return the access and rolling refresh expiration times", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-05T15:00:00.000Z"));

		const tokens = _createService().createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect({ accessExpiresAt: tokens.accessExpiresAt, refreshExpiresAt: tokens.refreshExpiresAt }).toEqual({
			accessExpiresAt: new Date("2026-08-05T15:15:00.000Z"),
			refreshExpiresAt: new Date("2026-09-04T15:00:00.000Z"),
		});
	});

	it("should issue refresh tokens with the current key identifier and authenticated session identifier", () => {
		const tokens = _createService().createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect(tokens.refreshToken).toMatch(
			new RegExp(`^rt1\\.current\\.${SESSION_ID}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$`),
		);
	});

	it("should issue a new 256-bit refresh secret every time", () => {
		const service = _createService();
		const secrets = new Set(
			Array.from(
				{ length: 100 },
				() => service.createAccessAndRefreshTokens({ sessionId: SESSION_ID }).refreshToken.split(".")[3],
			),
		);

		expect(secrets.size).toBe(100);
	});

	it("should return the SHA-256 hash of the complete refresh token", () => {
		const tokens = _createService().createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect(tokens.refreshTokenHash).toBe(createHash("sha256").update(tokens.refreshToken).digest("hex"));
	});

	it("should authenticate a current-key token without database state", () => {
		const service = _createService();
		const tokens = service.createAccessAndRefreshTokens({ sessionId: SESSION_ID });

		expect(service.getAuthenticatedRefreshTokenOrNull({ refreshToken: tokens.refreshToken })).toEqual({
			refreshTokenHash: tokens.refreshTokenHash,
			sessionId: SESSION_ID,
		});
	});

	it("should authenticate tokens signed by a retained previous key", () => {
		const token = _createTokenWithKey({ key: PREVIOUS_KEY, keyId: "previous", randomSecret: "a".repeat(43) });

		expect(_createService().getAuthenticatedRefreshTokenOrNull({ refreshToken: token })).toEqual({
			refreshTokenHash: createHash("sha256").update(token).digest("hex"),
			sessionId: SESSION_ID,
		});
	});

	it.each([
		["version", `rt2.current.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}`],
		["key identifier", `rt1.current!.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}`],
		["empty key identifier", `rt1..${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}`],
		["oversized key identifier", `rt1.${"k".repeat(33)}.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}`],
		["session identifier", `rt1.current.not-a-uuid.${"a".repeat(43)}.${"b".repeat(43)}`],
		["random secret", `rt1.current.${SESSION_ID}.short.${"b".repeat(43)}`],
		["signature", `rt1.current.${SESSION_ID}.${"a".repeat(43)}.short`],
		["segment count", "rt1.current.too-short"],
		["extra segment", `rt1.current.${SESSION_ID}.${"a".repeat(43)}.${"b".repeat(43)}.extra`],
	])("should reject a malformed %s", (_field, refreshToken) => {
		expect(_createService().getAuthenticatedRefreshTokenOrNull({ refreshToken: refreshToken })).toBeNull();
	});

	it("should reject a well-formed token whose key identifier is unknown", () => {
		const token = _createTokenWithKey({ key: CURRENT_KEY, keyId: "unknown", randomSecret: "a".repeat(43) });

		expect(_createService().getAuthenticatedRefreshTokenOrNull({ refreshToken: token })).toBeNull();
	});

	it("should reject an unknown key even if the token is signed with an all-zero key", () => {
		const token = _createTokenWithKey({
			key: Buffer.alloc(32).toString("base64url"),
			keyId: "unknown",
			randomSecret: "a".repeat(43),
		});

		expect(_createService().getAuthenticatedRefreshTokenOrNull({ refreshToken: token })).toBeNull();
	});

	it("should reject a token whose authenticated session identifier was changed", () => {
		const service = _createService();
		const token = service.createAccessAndRefreshTokens({ sessionId: SESSION_ID }).refreshToken;
		const tamperedToken = token.replace(`.${SESSION_ID}.`, ".b2527587-3416-4da0-a2b6-d8a04acb1074.");

		expect(service.getAuthenticatedRefreshTokenOrNull({ refreshToken: tamperedToken })).toBeNull();
	});

	it.each(Array.from({ length: 43 }, (_value, characterIndex) => characterIndex))(
		"should reject a signature mutation at character %i",
		(characterIndex) => {
			const service = _createService();
			const parts = service.createAccessAndRefreshTokens({ sessionId: SESSION_ID }).refreshToken.split(".");
			const signature = parts[4] ?? "";
			const replacement = signature[characterIndex] === "A" ? "Q" : "A";
			parts[4] = `${signature.slice(0, characterIndex)}${replacement}${signature.slice(characterIndex + 1)}`;

			expect(service.getAuthenticatedRefreshTokenOrNull({ refreshToken: parts.join(".") })).toBeNull();
		},
	);

	it("should fail closed when the current signing key is unavailable", () => {
		const service = _createService({
			refreshTokenHmacCurrentKid: "missing",
			refreshTokenHmacKeys: { current: CURRENT_KEY },
		});

		expect(() => service.createAccessAndRefreshTokens({ sessionId: SESSION_ID })).toThrow(
			"The current refresh-token signing key is unavailable",
		);
	});
});
