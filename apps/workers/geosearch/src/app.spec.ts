import { SignJWT } from "jose";
import { authService } from "./auth/auth.service";
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
		.setAudience("GEOSEARCH")
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + 600)
		.sign(privateKey);
}

function _createEnv(params?: {
	detailsRateLimit?: ReturnType<typeof vi.fn>;
	searchRateLimit?: ReturnType<typeof vi.fn>;
}): GeosearchWorkerEnv {
	return {
		ADDRESS_DETAILS_RATE_LIMITER: {
			limit: params?.detailsRateLimit ?? vi.fn().mockResolvedValue({ success: true }),
		},
		ADDRESS_SEARCH_RATE_LIMITER: {
			limit: params?.searchRateLimit ?? vi.fn().mockResolvedValue({ success: true }),
		},
		ENVIRONMENT: "development",
		GOOGLE_PLACES_API_KEY: "google-key",
		MICROSERVICES_AUTH_JWKS_URL: microservicesAuthJwksUrl,
		WORKER_VERSION_METADATA: {
			id: "geosearch-worker-version-id",
			tag: "0123456789abcdef0123456789abcdef01234567",
			timestamp: "2026-08-27T12:00:00.000Z",
		},
	} as never;
}

async function _createQueryRequest(params: {
	body: string | Record<string, unknown>;
	path: string;
	accessToken?: string;
	headers?: Record<string, string>;
}): Promise<Request> {
	const accessToken = params.accessToken ?? (await _createAccessToken());
	return new Request(`https://geosearch.cataqui.com${params.path}`, {
		method: "QUERY",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...params.headers,
		},
		body: typeof params.body === "string" ? params.body : JSON.stringify(params.body),
	});
}

describe("Geosearch Worker", () => {
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

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should expose an unauthenticated versioned readiness route", async () => {
		const response = await worker.fetch(new Request("https://geosearch.cataqui.com/v1/health"), _createEnv());

		expect({ status: response.status, cacheControl: response.headers.get("Cache-Control") }).toEqual({
			status: 204,
			cacheControl: "no-store",
		});
	});

	it("should reject an address search without a bearer token before limiting", async () => {
		const searchRateLimit = vi.fn();
		const response = await worker.fetch(
			new Request("https://geosearch.cataqui.com/v1/addresses/search", {
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "Address", sessionToken: "session" }),
			}),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 401,
			body: { errorCode: "UNAUTHORIZED", message: "A valid geosearch bearer token is required." },
			rateLimitCalls: [],
		});
	});

	it("should reject a structurally valid bearer token that cannot be authenticated", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
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
			body: { errorCode: "UNAUTHORIZED", message: "A valid geosearch bearer token is required." },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject malformed JSON through the owned error contract", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({ path: "/v1/addresses/search", body: "{" }),
			_createEnv({ searchRateLimit: searchRateLimit }),
		);

		expect({
			status: response.status,
			body: await response.json(),
			providerCalls: providerFetch.mock.calls,
			rateLimitCalls: searchRateLimit.mock.calls,
		}).toEqual({
			status: 400,
			body: { errorCode: "INVALID_REQUEST", message: "The request body is invalid." },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it.each([
		{
			name: "schema-invalid JSON",
			headers: new Headers({ "Content-Type": "application/json" }),
			body: JSON.stringify({ query: "Address" }),
		},
		{
			name: "JSON without its content type",
			headers: new Headers(),
			body: JSON.stringify({ query: "Address", sessionToken: "session" }),
		},
	])("should reject $name before limiting or provider access", async ({ body, headers }) => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const requestHeaders = new Headers(headers);
		requestHeaders.set("Authorization", `Bearer ${await _createAccessToken()}`);
		const response = await worker.fetch(
			new Request("https://geosearch.cataqui.com/v1/addresses/search", {
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
			body: { errorCode: "INVALID_REQUEST", message: "The address search request is invalid." },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should reject schema-invalid address details before limiting or provider access", async () => {
		const detailsRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/details",
				body: { addressId: "address-id" },
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
			body: { errorCode: "INVALID_REQUEST", message: "The address details request is invalid." },
			providerCalls: [],
			rateLimitCalls: [],
		});
	});

	it("should return a blank search without Google or rate-limit calls", async () => {
		const searchRateLimit = vi.fn();
		const providerFetch = vi.spyOn(globalThis, "fetch");
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/search",
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
				path: "/v1/addresses/search",
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
						addressId: "provider-id",
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

	it("should default the provider locale to en-US", async () => {
		const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

		await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
			}),
			_createEnv(),
		);
		const providerRequest = providerFetch.mock.calls[0]?.[0] as Request;

		const providerBody = (await providerRequest.json()) as Record<string, unknown>;
		expect(providerBody["languageCode"]).toBe("en-US");
	});

	it("should default an empty primary locale entry to en-US", async () => {
		const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

		await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
				headers: { "Accept-Language": ",pt-BR" },
			}),
			_createEnv(),
		);
		const providerRequest = providerFetch.mock.calls[0]?.[0] as Request;

		const providerBody = (await providerRequest.json()) as Record<string, unknown>;
		expect(providerBody["languageCode"]).toBe("en-US");
	});

	it("should reject a locale when canonicalization yields no language", async () => {
		const request = await _createQueryRequest({
			path: "/v1/addresses/search",
			body: { query: "Address", sessionToken: "session" },
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
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
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
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
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
			body: { errorCode: "RATE_LIMITED", message: "Too many address searches. Try again shortly." },
			providerCalls: [],
		});
	});

	it.each([
		{
			name: "address not found",
			path: "/v1/addresses/details",
			body: { addressId: "missing-address", sessionToken: "session" },
			providerResult: () => Promise.resolve(new Response(null, { status: 404 })),
			status: 404,
			output: { errorCode: "ADDRESS_NOT_FOUND", message: "The requested address was not found." },
			expectedErrorEvents: [],
		},
		{
			name: "provider rejection",
			path: "/v1/addresses/search",
			body: { query: "Address", sessionToken: "session" },
			providerResult: () => Promise.resolve(new Response(null, { status: 503 })),
			status: 502,
			output: { errorCode: "PROVIDER_UNAVAILABLE", message: "Address search is temporarily unavailable." },
			expectedErrorEvents: ["geosearch.provider.request.rejected", "geosearch.request.rejected"],
		},
		{
			name: "provider timeout",
			path: "/v1/addresses/search",
			body: { query: "Address", sessionToken: "session" },
			providerResult: () => Promise.reject(new DOMException("timed out", "TimeoutError")),
			status: 504,
			output: { errorCode: "PROVIDER_UNAVAILABLE", message: "Address search is temporarily unavailable." },
			expectedErrorEvents: ["geosearch.provider.request.rejected", "geosearch.request.rejected"],
		},
	])(
		"should centrally translate $name service errors",
		async ({ body, expectedErrorEvents, output, path, providerResult, status }) => {
			const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
			vi.spyOn(globalThis, "fetch").mockImplementation(providerResult);

			const response = await worker.fetch(await _createQueryRequest({ path: path, body: body }), _createEnv());

			expect({
				status: response.status,
				body: await response.json(),
				errorEvents: consoleError.mock.calls.map((call) => (call[0] as { event: string }).event),
			}).toEqual({
				status: status,
				body: output,
				errorEvents: expectedErrorEvents,
			});
		},
	);

	it("should return coordinates from a terminating details request", async () => {
		const detailsRateLimit = vi.fn().mockResolvedValue({ success: true });
		const providerFetch = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(Response.json({ location: { latitude: -23.5505, longitude: -46.6333 } }));
		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/details",
				body: { addressId: "address-id", sessionToken: "frontend-session" },
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
			providerUrl: "https://places.googleapis.com/v1/places/address-id?sessionToken=frontend-session",
			rateLimitParams: { key: `development:${userId}` },
		});
	});

	it("should require QUERY for address operations", async () => {
		const response = await worker.fetch(
			new Request("https://geosearch.cataqui.com/v1/addresses/search", {
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
			await _createQueryRequest({ path: "/v1/addresses/search", body: "x".repeat(4 * 1024 + 1) }),
			_createEnv(),
		);

		expect({ status: response.status, body: await response.json(), providerCalls: providerFetch.mock.calls }).toEqual({
			status: 413,
			body: { errorCode: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
			providerCalls: [],
		});
	});

	it("should reject unknown routes without caching the response", async () => {
		const response = await worker.fetch(new Request("https://geosearch.cataqui.com/v1/unknown"), _createEnv());

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
				path: "/v1/addresses/search",
				body: { query: "private address", sessionToken: "private-session" },
			}),
			env,
		);

		const serializedLogs = JSON.stringify(consoleError.mock.calls);
		expect({
			status: response.status,
			log: consoleError.mock.calls[0]?.[0],
			leaksAddress: serializedLogs.includes("private address"),
			leaksSession: serializedLogs.includes("private-session"),
		}).toEqual({
			status: 500,
			log: expect.objectContaining({
				env: "development",
				event: "geosearch.request.failed",
				method: "QUERY",
				outcome: "THREW",
				responseStatus: 500,
				route: "/v1/addresses/search",
				service: "cataqui-geosearch-development",
				version: "0123456789abcdef0123456789abcdef01234567",
				errorName: "Error",
			}),
			leaksAddress: false,
			leaksSession: false,
		});
	});

	it("should safely handle a non-error value thrown outside Hono's error handler", async () => {
		const env = _createEnv({
			searchRateLimit: vi.fn().mockRejectedValue({ privateBindingValue: "must-not-be-logged" }),
		});

		const response = await worker.fetch(
			await _createQueryRequest({
				path: "/v1/addresses/search",
				body: { query: "Address", sessionToken: "session" },
			}),
			env,
		);

		const serializedLogs = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect({
			status: response.status,
			body: await response.json(),
			log: vi.mocked(console.error).mock.calls[0]?.[0],
			leaksThrownValue: serializedLogs.includes("must-not-be-logged"),
		}).toEqual({
			status: 500,
			body: { errorCode: "INTERNAL_ERROR", message: "An unexpected error occurred." },
			log: expect.objectContaining({
				errorName: "UnknownError",
				event: "geosearch.request.failed",
				outcome: "THREW",
			}),
			leaksThrownValue: false,
		});
	});
});
