import { SignJWT } from "jose";
import { authService } from "./shared/auth/auth.service";
import worker from "./app";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let privateKey: CryptoKey;
let jwksJson: string;
const microservicesAuthJwksUrl = "https://api.cataqui.test/v1/auth/microservices/jwks/worker-spec";

async function _createAccessToken(): Promise<string> {
	const issuedAt = Math.floor(Date.now() / 1_000);
	return new SignJWT()
		.setProtectedHeader({ alg: "ES256", kid: "V1", typ: "microservice-access+jwt" })
		.setSubject(userId)
		.setAudience("MAPS")
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + 600)
		.sign(privateKey);
}

function _createEnv(params?: {
	detailsRateLimit?: ReturnType<typeof vi.fn>;
	searchRateLimit?: ReturnType<typeof vi.fn>;
}): MapsWorkerEnv {
	return {
		PLACE_DETAILS_RATE_LIMITER: {
			limit: params?.detailsRateLimit ?? vi.fn().mockResolvedValue({ success: true }),
		},
		PLACE_SEARCH_RATE_LIMITER: {
			limit: params?.searchRateLimit ?? vi.fn().mockResolvedValue({ success: true }),
		},
		ENVIRONMENT: "development",
		GOOGLE_PLACES_API_KEY: "google-key",
		MICROSERVICES_AUTH_JWKS_URL: microservicesAuthJwksUrl,
	} as never;
}

async function _createQueryRequest(params: {
	body: string | Record<string, unknown>;
	path: string;
	accessToken?: string;
	headers?: Record<string, string>;
}): Promise<Request> {
	const accessToken = params.accessToken ?? (await _createAccessToken());
	return new Request(`https://maps.cataqui.com${params.path}`, {
		method: "QUERY",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			"Accept-Language": "pt-BR",
			...params.headers,
		},
		body: typeof params.body === "string" ? params.body : JSON.stringify(params.body),
	});
}

describe("Maps Worker", () => {
	beforeAll(async () => {
		const keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
			"sign",
			"verify",
		])) as CryptoKeyPair;
		privateKey = keyPair.privateKey;
		const publicKey = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
		jwksJson = JSON.stringify({
			keys: [
				{
					kty: publicKey.kty,
					crv: publicKey.crv,
					x: publicKey.x,
					y: publicKey.y,
					alg: "ES256",
					kid: "V1",
					use: "sig",
				},
			],
		});
		const jwksFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(jwksJson, {
				headers: { "Content-Type": "application/jwk-set+json" },
			}),
		);
		await authService.getAuthenticatedUserIdOrNull({
			accessToken: await _createAccessToken(),
			microservicesAuthJwksUrl: microservicesAuthJwksUrl,
		});
		jwksFetch.mockRestore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should expose an unauthenticated versioned readiness route", async () => {
		const response = await worker.fetch(new Request("https://maps.cataqui.com/v1/health"), _createEnv());

		expect({ status: response.status, cacheControl: response.headers.get("Cache-Control") }).toEqual({
			status: 204,
			cacheControl: "no-store",
		});
	});

	it("should reject an place search without a bearer token before limiting", async () => {
		const searchRateLimit = vi.fn();
		const response = await worker.fetch(
			new Request("https://maps.cataqui.com/places/search", {
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "Place", sessionToken: "session" }),
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 401,
			body: { errorCode: "UNAUTHORIZED", message: "A valid maps bearer token is required." },
			rateLimitCalls: [],
		});
	});

	it("should reject a structurally valid bearer token that cannot be authenticated", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "Place", sessionToken: "session" },
				accessToken: "abc.def.ghi",
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 401,
			body: { errorCode: "UNAUTHORIZED", message: "A valid maps bearer token is required." },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject malformed JSON through the owned error contract", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({ path: "/places/search", body: "{" }),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			body: {
				errorCode: "INVALID_REQUEST",
				message: "The request body is invalid.",
				violations: [{ path: "body", message: "Expected valid JSON." }],
			},
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it.each([
		{
			name: "schema-invalid JSON",
			headers: new Headers({ "Content-Type": "application/json" }),
			body: JSON.stringify({ query: "Place" }),
		},
		{
			name: "JSON without its content type",
			headers: new Headers(),
			body: JSON.stringify({ query: "Place", sessionToken: "session" }),
		},
	])("should reject $name before limiting or provider access", async ({ body, headers }) => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const requestHeaders = new Headers(headers);
		requestHeaders.set("Authorization", `Bearer ${await _createAccessToken()}`);
		const response = await worker.fetch(
			new Request("https://maps.cataqui.com/places/search", {
				method: "QUERY",
				headers: requestHeaders,
				body: body,
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			body: {
				errorCode: "INVALID_REQUEST",
				message: "The place search request is invalid.",
				violations: expect.any(Array),
			},
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject schema-invalid place details before limiting or provider access", async () => {
		const detailsRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/details",
				body: { placeId: "place-id" },
			}),
			_createEnv({ detailsRateLimit: detailsRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: detailsRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			body: {
				errorCode: "INVALID_REQUEST",
				message: "The place details request is invalid.",
				violations: expect.any(Array),
			},
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("reports every invalid place-search field before provider access", async () => {
		const response = await worker.fetch(
			await _createQueryRequest({ path: "/places/search", body: { query: 123, sessionToken: "" } }),
			_createEnv(),
		);
		expect(await response.json()).toMatchObject({
			violations: expect.arrayContaining([
				{ path: "query", message: expect.any(String) },
				{ path: "sessionToken", message: expect.any(String) },
			]),
		});
	});

	it("should return a blank search without Google or rate-limit calls", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "   ", sessionToken: "session" },
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 200,
			body: { suggestions: [], attribution: { text: "Google Maps" } },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should forward the canonical active locale and return provider-neutral suggestions", async () => {
		const searchRateLimit = vi.fn().mockResolvedValue({ success: true });
		const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({
				suggestions: [
					{
						placePrediction: {
							placeId: "provider-id",
							text: { text: "Rua Augusta, São Paulo" },
							structuredFormat: {
								mainText: { text: "Rua Augusta" },
								secondaryText: { text: "São Paulo" },
							},
							types: ["route"],
						},
					},
				],
			}),
		);
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "Rua Augusta", sessionToken: "frontend_session" },
				headers: { "Accept-Language": "pt-br, en;q=0.8", "x-request-id": "request-123" },
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);
		const providerRequest = providerFetch.mock.calls[0]?.[0] as Request;
		const providerBody = (await providerRequest.json()) as Record<string, unknown>;

		expect({
			status: response.status,
			requestId: response.headers.get("x-request-id"),
			cacheControl: response.headers.get("Cache-Control"),
			body: await response.json(),
			languageCode: providerBody["languageCode"],
			sessionToken: providerBody["sessionToken"],
			rateLimitParams: searchRateLimit.mock.calls[0]?.[0],
		}).toEqual({
			status: 200,
			requestId: "request-123",
			cacheControl: "no-store",
			body: {
				suggestions: [
					{
						placeId: "provider-id",
						fullText: "Rua Augusta, São Paulo",
						primaryText: "Rua Augusta",
						secondaryText: "São Paulo",
						category: "STREET",
					},
				],
				attribution: { text: "Google Maps" },
			},
			languageCode: "pt-BR",
			sessionToken: "frontend_session",
			rateLimitParams: { key: `development:${userId}` },
		});
	});

	it.each([
		{ name: "missing", value: undefined },
		{ name: "empty", value: "" },
		{ name: "blank", value: "   " },
		{ name: "empty primary entry", value: ",pt-BR" },
	])("should reject a $name locale before rate limiting or provider access", async ({ value }) => {
		const searchRateLimit = vi.fn().mockResolvedValue({ success: true });
		const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
		const request = await _createQueryRequest({
			path: "/places/search",
			body: { query: "Place", sessionToken: "session" },
		});
		if (value === undefined) request.headers.delete("Accept-Language");
		else request.headers.set("Accept-Language", value);

		const response = await worker.fetch(request, _createEnv({ searchRateLimit: searchRateLimit }));

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			body: {
				errorCode: "INVALID_REQUEST",
				message: "The place search request is invalid.",
				violations: [{ path: "headers.Accept-Language", message: "Expected a valid language tag." }],
			},
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject a locale when canonicalization yields no language", async () => {
		const request = await _createQueryRequest({
			path: "/places/search",
			body: { query: "Place", sessionToken: "session" },
			headers: { "Accept-Language": "pt-BR" },
		});
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		vi.spyOn(Intl, "getCanonicalLocales").mockReturnValue([]);

		const response = await worker.fetch(request, _createEnv({ searchRateLimit: searchRateLimit }));

		expect({
			status: response.status,
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject an invalid locale before rate limiting or provider access", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "Place", sessionToken: "session" },
				headers: { "Accept-Language": "not a locale" },
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should return rate-limit recovery without contacting Google", async () => {
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "Place", sessionToken: "session" },
			}),
			_createEnv({ searchRateLimit: vi.fn().mockResolvedValue({ success: false }) }),
		);

		expect({
			status: response.status,
			retryAfter: response.headers.get("Retry-After"),
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
		}).toEqual({
			status: 429,
			retryAfter: "60",
			body: { errorCode: "RATE_LIMITED", message: "Too many place searches. Try again shortly." },
			providerCalls: [],
		});
	});

	it.each([
		{
			name: "place not found",
			path: "/places/details",
			body: { placeId: "missing-place", sessionToken: "session" },
			providerResult: () => Promise.resolve(new Response(null, { status: 404 })),
			status: 404,
			output: { errorCode: "PLACE_NOT_FOUND", message: "The requested place was not found." },
		},
		{
			name: "provider rejection",
			path: "/places/search",
			body: { query: "Place", sessionToken: "session" },
			providerResult: () => Promise.resolve(new Response(null, { status: 503 })),
			status: 502,
			output: { errorCode: "PROVIDER_UNAVAILABLE", message: "Place search is temporarily unavailable." },
		},
		{
			name: "provider timeout",
			path: "/places/search",
			body: { query: "Place", sessionToken: "session" },
			providerResult: () => Promise.reject(new DOMException("timed out", "TimeoutError")),
			status: 504,
			output: { errorCode: "PROVIDER_UNAVAILABLE", message: "Place search is temporarily unavailable." },
		},
	])("should centrally translate $name service errors", async ({ body, output, path, providerResult, status }) => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(globalThis, "fetch").mockImplementation(providerResult);

		const response = await worker.fetch(await _createQueryRequest({ path: path, body: body }), _createEnv());

		expect({ status: response.status, body: await response.json(), unexpectedLogs: consoleError.mock.calls }).toEqual({
			status: status,
			body: output,
			unexpectedLogs: [],
		});
	});

	it("should return coordinates from a terminating details request", async () => {
		const detailsRateLimit = vi.fn().mockResolvedValue({ success: true });
		const providerFetch = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(Response.json({ location: { latitude: -23.5505, longitude: -46.6333 } }));
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/details",
				body: { placeId: "place-id", sessionToken: "frontend-session" },
			}),
			_createEnv({ detailsRateLimit: detailsRateLimit }),
		);
		const providerRequest = providerFetch.mock.calls[0]?.[0] as Request;

		expect({
			status: response.status,
			body: await response.json(),
			providerUrl: providerRequest.url,
			rateLimitParams: detailsRateLimit.mock.calls[0]?.[0],
		}).toEqual({
			status: 200,
			body: { latitude: -23.5505, longitude: -46.6333 },
			providerUrl: "https://places.googleapis.com/v1/places/place-id?sessionToken=frontend-session",
			rateLimitParams: { key: `development:${userId}` },
		});
	});

	it("should require QUERY for place operations", async () => {
		const response = await worker.fetch(
			new Request("https://maps.cataqui.com/places/search", {
				method: "POST",
				headers: { Authorization: `Bearer ${await _createAccessToken()}` },
			}),
			_createEnv(),
		);

		expect({ status: response.status, allow: response.headers.get("Allow") }).toEqual({ status: 405, allow: "QUERY" });
	});

	it("should reject oversized bodies before authentication or provider access", async () => {
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({ path: "/places/search", body: "x".repeat(4 * 1024 + 1) }),
			_createEnv(),
		);

		expect({ status: response.status, body: await response.json(), providerCalls: providerFetch.mock.calls }).toEqual({
			status: 413,
			body: { errorCode: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
			providerCalls: [],
		});
	});

	it("should reject unknown routes without caching the response", async () => {
		const response = await worker.fetch(new Request("https://maps.cataqui.com/v1/unknown"), _createEnv());

		expect({ status: response.status, cacheControl: response.headers.get("Cache-Control") }).toEqual({
			status: 404,
			cacheControl: "no-store",
		});
	});

	it("should log only safe metadata for unexpected failures", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const env = _createEnv({ searchRateLimit: vi.fn().mockRejectedValue(new Error("binding failed")) });

		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/places/search",
				body: { query: "private place", sessionToken: "private-session" },
			}),
			env,
		);

		expect({ status: response.status, log: consoleError.mock.calls[0]?.[0] }).toEqual({
			status: 500,
			log: expect.objectContaining({
				event: "maps.request.failed",
				method: "QUERY",
				path: "/places/search",
				responseStatus: 500,
				errorName: "Error",
			}),
		});
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private place");
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private-session");
	});
});
