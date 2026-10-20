import type { MapsWorkerEnv } from "../cloudflare.config.ts";
import { container } from "tsyringe";
import * as td from "testdouble";
import { AuthService } from "./auth/auth.service";
import worker from "./app";
import { PlacesService } from "./places/places.service";
import { MapsErrorCode } from "./errors/maps-error-code.enum";
import { PlaceNotFoundError } from "./places/errors/place-not-found.error";
import { StaticService } from "./static/static.service";
import type { GenerateStaticImageOutput } from "./static/static.repository";

let _authService: AuthService;
let _placesService: PlacesService;
let _environment: MapsWorkerEnv;
beforeEach(() => {
	_placesService = td.object<PlacesService>();
	_environment = td.object<MapsWorkerEnv>();
	_environment.ENVIRONMENT = "development";
	container.registerInstance(PlacesService, _placesService);
	_authService = td.object<AuthService>();
	container.registerInstance(AuthService, _authService);
});
afterEach(() => {
	td.reset();
	container.clearInstances();
	vi.useRealTimers();
});

it("serves a public readiness response without caching", async () => {
	const response = await _fetch(new Request("https://maps.cataqui.com/v1/health"), _environment);
	expect({ status: response.status, cacheControl: response.headers.get("Cache-Control") }).toEqual({
		status: 204,
		cacheControl: "no-store",
	});
});

it("preserves the cache policy supplied by static image delivery", async () => {
	const staticService = td.object<StaticService>();
	container.registerInstance(StaticService, staticService);
	td.when(staticService.generateImage(td.matchers.anything())).thenResolve({
		bytes: new Uint8Array([1, 2, 3]),
		contentType: "image/webp",
		digest: "a".repeat(64),
	});
	const response = await _fetch(
		new Request("https://maps.cataqui.com/static/v1/reference.webp?size=480x480"),
		_environment,
		td.object<ExecutionContext>(),
	);
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, stale-if-error=31536000");
});

it("preserves request correlation and cache metadata on a conditional image response", async () => {
	const staticService = td.object<StaticService>();
	container.registerInstance(StaticService, staticService);
	td.when(staticService.generateImage(td.matchers.anything())).thenResolve({
		bytes: new Uint8Array([1, 2, 3]),
		contentType: "image/webp",
		digest: "a".repeat(64),
	} satisfies GenerateStaticImageOutput);
	const response = await _fetch(
		new Request("https://maps.cataqui.com/static/v1/reference.webp?size=480x480", {
			headers: { "x-request-id": "conditional-request", "If-None-Match": "*" },
		}),
		_environment,
	);
	expect({
		status: response.status,
		requestId: response.headers.get("x-request-id"),
		cacheControl: response.headers.get("Cache-Control"),
		nosniff: response.headers.get("X-Content-Type-Options"),
		body: await response.text(),
	}).toEqual({
		status: 304,
		requestId: "conditional-request",
		cacheControl: "public, max-age=31536000, stale-if-error=31536000",
		nosniff: "nosniff",
		body: "",
	});
});

it.each(["/unknown", "/v1/images", "/internal/generate", "/internal/prepare"])(
	"returns the owned not-found response for %s",
	async (path) => {
		const response = await _fetch(new Request(`https://maps.cataqui.com${path}`), _environment);
		expect({
			status: response.status,
			cacheControl: response.headers.get("Cache-Control"),
			body: await response.json(),
		}).toEqual({
			status: 404,
			cacheControl: "no-store",
			body: expect.objectContaining({ errorCode: MapsErrorCode.ROUTE_NOT_FOUND }),
		});
	},
);

it.each(["request-123", "a_b=c-123", "x".repeat(129)])("retains the accepted request ID %s", async (requestId) => {
	const response = await _fetch(
		new Request("https://maps.cataqui.com/v1/health", { headers: { "x-request-id": requestId } }),
		_environment,
	);
	expect(response.headers.get("x-request-id")).toBe(requestId);
});

it.each([undefined, "", "unsafe request id", "a_b.c-123", "x".repeat(256)])(
	"generates an ID when the received ID is %s",
	async (requestId) => {
		const response = await _fetch(
			new Request("https://maps.cataqui.com/v1/health", {
				headers: requestId === undefined ? {} : { "x-request-id": requestId },
			}),
			_environment,
		);
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	},
);

it("exposes the current HTTP contracts through OpenAPI", async () => {
	const response = await _fetch(new Request("https://maps.cataqui.com/openapi.json"), _environment);
	const document = await response.json();
	expect({ status: response.status, body: document }).toMatchObject({
		status: 200,
		body: {
			openapi: "3.2.0",
			paths: {
				"/places/search": {
					query: {
						responses: {
							"200": {
								content: {
									"application/json": {
										schema: {
											required: ["data", "requestId", "timestamp", "endpoint"],
											properties: {
												data: { properties: { suggestions: { type: "array" }, attribution: {} } },
												requestId: {},
												timestamp: {},
												endpoint: {},
											},
										},
									},
								},
							},
						},
						requestBody: {
							required: true,
							content: {
								"application/json": { schema: { properties: { query: { maxLength: 256 }, sessionToken: {} } } },
							},
						},
						parameters: expect.arrayContaining([
							expect.objectContaining({
								in: "header",
								name: "accept-language",
								required: true,
								schema: { type: "string", description: expect.any(String), examples: ["pt-BR"] },
							}),
						]),
					},
				},
				"/places/details": {
					query: {
						responses: {
							default: {
								content: {
									"application/json": {
										schema: {
											properties: { errorCode: { enum: Object.values(MapsErrorCode) } },
										},
									},
								},
							},
							"200": {
								content: {
									"application/json": {
										schema: {
											required: ["data", "requestId", "timestamp", "endpoint"],
											properties: {
												data: { properties: { latitude: { minimum: -90, maximum: 90 }, longitude: {} } },
												requestId: {},
												timestamp: {},
												endpoint: {},
											},
										},
									},
								},
							},
						},
					},
				},
				"/static/v1/{image}": {
					get: {
						parameters: expect.arrayContaining([
							expect.objectContaining({
								in: "path",
								name: "image",
								required: true,
								schema: expect.objectContaining({ pattern: "^[A-Za-z0-9_-]+\\.webp$" }),
							}),
							expect.objectContaining({
								in: "query",
								name: "size",
								required: true,
								schema: expect.objectContaining({ enum: ["480x480", "480x1280"] }),
							}),
						]),
					},
					head: { responses: { "200": { description: "Map response headers without a body." } } },
				},
			},
		},
	});
	expect(document).toEqual(
		expect.objectContaining({
			paths: {
				"/v1/health": expect.anything(),
				"/places/search": { query: expect.anything() },
				"/places/details": { query: expect.anything() },
				"/static/v1/{image}": {
					get: expect.anything(),
					head: expect.objectContaining({
						responses: expect.objectContaining({
							"200": { description: "Map response headers without a body.", headers: expect.anything() },
						}),
					}),
				},
			},
		}),
	);
});

it("rejects oversized bodies before authentication", async () => {
	const response = await _fetch(
		new Request("https://maps.cataqui.com/places/search", {
			method: "QUERY",
			headers: { Authorization: `Bearer ${"a".repeat(43)}`, "Content-Type": "application/json" },
			body: "x".repeat(4 * 1024 + 1),
		}),
		_environment,
	);
	expect({
		status: response.status,
		body: await response.json(),
		authenticationCalls: td.explain(_authService.getAuthenticatedAccountIdOrNull).callCount,
	}).toEqual({
		status: 413,
		body: expect.objectContaining({ errorCode: MapsErrorCode.PAYLOAD_TOO_LARGE }),
		authenticationCalls: 0,
	});
});

it.each([
	{
		name: "owned failure",
		failure: new PlaceNotFoundError(),
		status: 404,
		code: MapsErrorCode.PLACE_NOT_FOUND,
	},
	{
		name: "unexpected failure",
		failure: new Error("private diagnostic"),
		status: 500,
		code: MapsErrorCode.INTERNAL_ERROR,
	},
])("adds the complete HTTP envelope to an $name", async ({ failure, status, code }) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
	td.replace(console, "error");
	td.when(_authService.getAuthenticatedAccountIdOrNull(td.matchers.anything())).thenResolve("account-1");
	td.when(_placesService.searchPlaces(td.matchers.anything())).thenReject(failure);
	const response = await _fetch(
		new Request("https://maps.cataqui.com/places/search?private-query=hidden", {
			method: "QUERY",
			headers: {
				Authorization: `Bearer ${"a".repeat(43)}`,
				"Content-Type": "application/json",
				"Accept-Language": "pt-BR",
				"x-request-id": "envelope-request",
			},
			body: JSON.stringify({ query: "Place", sessionToken: "session" }),
		}),
		_environment,
	);
	expect({
		status: response.status,
		requestId: response.headers.get("x-request-id"),
		cacheControl: response.headers.get("Cache-Control"),
		body: await response.json(),
	}).toEqual({
		status: status,
		requestId: "envelope-request",
		cacheControl: "no-store",
		body: {
			errorCode: code,
			message: expect.any(String),
			status: status,
			requestId: "envelope-request",
			timestamp: "2026-10-19T12:00:00.000Z",
			endpoint: "/places/search",
		},
	});
});

function _fetch(
	request: Request,
	environment: MapsWorkerEnv,
	executionContext: ExecutionContext = td.object<ExecutionContext>(),
): Promise<Response> {
	return Promise.resolve(worker.fetch(request, environment, executionContext));
}
