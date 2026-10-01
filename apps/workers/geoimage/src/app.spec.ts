import { authService } from "./auth/auth.service";
import { MapRendering } from "./maps/map-rendering";
import { HTTPException } from "hono/http-exception";
import { createTestBindings, Jpeg, Query } from "../test/fakes";
import app from "./app";
import { ImageService } from "./images/image.service";
import { MapService } from "./maps/map.service";

let _bindings: ReturnType<typeof createTestBindings>;
const _fetch = vi.fn<typeof fetch>();
function _request(params?: {
	query?: string;
	headers?: Record<string, string>;
	env?: Partial<GeoimageWorkerEnv>;
	origin?: string;
}) {
	return app.request(
		`${params?.origin ?? "http://localhost"}/v1/images?${params?.query ?? Query}`,
		{ headers: params?.headers ?? {} },
		{ ..._bindings.env, ...params?.env },
		_bindings.execution,
	);
}

beforeEach(() => {
	vi.spyOn(authService, "authorizeImage").mockResolvedValue(undefined);
	_bindings = createTestBindings();
	vi.stubGlobal("fetch", _fetch);
	_fetch.mockImplementation(
		async () => new Response(Jpeg, { headers: { "Content-Type": "image/jpeg", "x-provider-secret": "private" } }),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	_fetch.mockReset();
});

describe("Geoimage GET images", () => {
	it("generates and stores a cacheable JPEG with fixed native rendering settings", async () => {
		const response = await _request({ headers: { "Accept-Language": "en", "x-request-id": "first" } });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=31536000");
		expect(response.headers.get("x-request-id")).toBeNull();
		expect(response.headers.get("x-provider-secret")).toBeNull();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(Jpeg);
		expect(_bindings.put).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(/^maps\/v1\/[a-f0-9]{64}\.jpg$/),
			Jpeg,
			{
				httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=86400, s-maxage=31536000" },
			},
		);
		expect(_fetch).toHaveBeenCalledTimes(1);
		const [url, options] = _fetch.mock.calls[0]!;
		expect(new URL(String(url)).origin + new URL(String(url)).pathname).toBe("https://maps.geoapify.com/v1/staticmap");
		expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({
			apiKey: "test-secret",
			center: "lonlat:-46.6333,-23.5505",
			style: "osm-bright",
			styleCustomization: MapRendering.styleCustomization,
			width: "480",
			height: "1280",
			scaleFactor: "2",
			zoom: "13",
			format: "jpeg",
		});
		expect(options?.redirect).toBe("manual");
		expect(options?.headers).toBeUndefined();
		expect(options?.signal).toBeInstanceOf(AbortSignal);
	});
	it("streams cacheable R2 bytes without provider credentials", async () => {
		await (await _request()).arrayBuffer();
		_bindings.generate.mockClear();
		const response = await _request({ env: { GEOAPIFY_API_KEY: "" } });
		expect(response.status).toBe(200);
		expect(response.headers.get("ETag")).toBe('"stored-etag"');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(Jpeg);
		expect(_bindings.generate).not.toHaveBeenCalled();
		expect(_fetch).toHaveBeenCalledTimes(1);
	});
	it("normalizes query ordering, equivalent numbers and default density without rounding", async () => {
		await (await _request()).arrayBuffer();
		await (await _request({ query: "density=2&size=480x1280&longitude=-46.633300&latitude=-23.550500" })).arrayBuffer();
		expect(_fetch).toHaveBeenCalledTimes(1);
		await (await _request({ query: "size=480x1280&longitude=-46.6333&latitude=-23.55050001" })).arrayBuffer();
		expect(_fetch).toHaveBeenCalledTimes(2);
	});
	it("shares stored images across hosts and isolates identities by environment", async () => {
		await (await _request()).arrayBuffer();
		await (await _request({ origin: "https://other.test" })).arrayBuffer();
		expect(_fetch).toHaveBeenCalledTimes(1);
		await (await _request({ env: { ENVIRONMENT: "staging" } })).arrayBuffer();
		expect(_bindings.objects.size).toBe(2);
		expect(_fetch).toHaveBeenCalledTimes(2);
	});
	it.each(["480x1280", "480x480"])("supports size %s at both densities", async (size) => {
		for (const density of ["1", "2"]) {
			const response = await _request({ query: `latitude=0&longitude=0&size=${size}&density=${density}` });
			expect(response.status).toBe(200);
			await response.arrayBuffer();
		}
		expect(_fetch).toHaveBeenCalledTimes(2);
		expect(_fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("scaleFactor"))).toEqual(["1", "2"]);
	});
	it("shares one cold generation between concurrent requests", async () => {
		const responses = await Promise.all(Array.from({ length: 10 }, () => _request()));
		expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
		expect(await Promise.all(responses.map(async (response) => new Uint8Array(await response.arrayBuffer())))).toEqual(
			Array(10).fill(Jpeg),
		);
		expect(_fetch).toHaveBeenCalledTimes(1);
		expect(_bindings.put).toHaveBeenCalledTimes(1);
	});
	it("allows distinct missing images to generate independently", async () => {
		const responses = await Promise.all([_request(), _request({ query: "latitude=0&longitude=0&size=480x480" })]);
		await Promise.all(responses.map((response) => response.arrayBuffer()));
		expect(_fetch).toHaveBeenCalledTimes(2);
		expect(_bindings.objects.size).toBe(2);
	});
	it("returns cacheable generated bytes when persistence fails, without exposing storage errors", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		_bindings.put.mockRejectedValue(new Error("private storage details"));
		const response = await _request({ headers: { "x-request-id": "write-failure" } });
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(Jpeg);
		expect(_bindings.objects.size).toBe(0);
		expect(log).toHaveBeenCalledExactlyOnceWith({
			event: "geoimage.storage.write.failed",
			requestId: "write-failure",
		});
		expect((await _request()).status).toBe(200);
		expect(_fetch).toHaveBeenCalledTimes(2);
	});
	it("does not generate on R2 read failures", async () => {
		_bindings.get.mockRejectedValue(new Error("private"));
		const response = await _request();
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ errorCode: "STORAGE_UNAVAILABLE" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(_fetch).not.toHaveBeenCalled();
	});
	it.each([undefined, "bad id", "a".repeat(129)])("generates a request ID for %s", async (id) => {
		const response = await _request({ query: "", headers: id === undefined ? {} : { "x-request-id": id } });
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
		await response.arrayBuffer();
	});
});

describe("query validation and routing", () => {
	it.each([
		"",
		"latitude=0",
		"latitude=&longitude=0&size=480x480",
		"latitude=NaN&longitude=0&size=480x480",
		"latitude=Infinity&longitude=0&size=480x480",
		"latitude=91&longitude=181&size=480x480",
		"latitude=-91&longitude=-181&size=480x480",
		"latitude=abc&longitude=0&size=480x480",
		`${Query}&size=480x480`,
		`${Query}&latitude=0`,
		`${Query}&longitude=0`,
		`${Query}&density=1&density=2`,
		`${Query}&unknown=private`,
		"latitude=0&longitude=0&size=960x2560&density=3",
		"latitude=%20%20&longitude=0&size=480x480",
	])("rejects invalid query %s without external operations", async (query) => {
		const response = await _request({ query: query });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ errorCode: "VALIDATION_ERROR", violations: expect.any(Array) });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(_fetch).not.toHaveBeenCalled();
		expect(_bindings.get).not.toHaveBeenCalled();
		expect(_bindings.generate).not.toHaveBeenCalled();
	});
	it("collects coordinate, size and density errors at flat query paths", async () => {
		const response = await _request({ query: "latitude=91&longitude=181&size=wrong&density=3" });
		expect(await response.json()).toEqual({
			errorCode: "VALIDATION_ERROR",
			violations: [
				{ path: ["latitude"], message: expect.any(String) },
				{ path: ["longitude"], message: expect.any(String) },
				{ path: ["size"], message: "Map size must be 480x1280 or 480x480." },
				{ path: ["density"], message: "Density must be 1 or 2." },
			],
		});
	});
	it("explains duplicate parameters without echoing their values", async () => {
		expect(await (await _request({ query: `${Query}&latitude=private` })).json()).toEqual({
			errorCode: "VALIDATION_ERROR",
			violations: [{ path: ["latitude"], message: "Provide this parameter exactly once." }],
		});
	});
	it.each(["POST", "PUT", "DELETE", "OPTIONS"])("rejects %s before generating or accessing storage", async (method) => {
		const response = await app.request(`/v1/images?${Query}`, { method: method }, _bindings.env, _bindings.execution);
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, HEAD");
		expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED" });
		expect(_fetch).not.toHaveBeenCalled();
		expect(_bindings.get).not.toHaveBeenCalled();
	});
	it("rejects trailing-slash image requests without cache, storage or provider access", async () => {
		const response = await app.request(`/v1/images/?${Query}`, {}, _bindings.env, _bindings.execution);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
		expect(_bindings.get).not.toHaveBeenCalled();
		expect(_fetch).not.toHaveBeenCalled();
	});
	it.each(["GET", "HEAD"])("serves %s health without credentials or bindings", async (method) => {
		const response = await app.request("/v1/health", { method: method }, {});
		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
	});
	it("rejects unsupported health methods", async () => {
		const response = await app.request("/v1/health", { method: "POST" }, {});
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, HEAD");
	});
	it.each(["/missing", "/v1/maps"])("returns owned 404 for %s", async (path) => {
		const response = await app.request(path, {}, {});
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
	});
	it.each([false, true])("keeps the global 4 KiB body limit with content length: %s", async (withLength) => {
		const response = await app.request(
			"/missing",
			{ method: "POST", body: " ".repeat(4097), headers: withLength ? { "Content-Length": "4097" } : {} },
			{},
		);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ errorCode: "PAYLOAD_TOO_LARGE" });
	});
});

describe("sanitized generation failures", () => {
	it.each(["", "   "])("rejects missing credentials only on a generation miss", async (key) => {
		_bindings.env.GEOAPIFY_API_KEY = key;
		const response = await _request();
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR" });
		expect(_fetch).not.toHaveBeenCalled();
	});
	it.each([302, 400, 401, 403, 429, 500, 503])("sanitizes upstream status %s without retries", async (status) => {
		_fetch.mockResolvedValue(
			new Response("private test-secret", {
				status: status,
				headers: { "Content-Type": "image/jpeg", Location: "https://private.test/" },
			}),
		);
		const response = await _request();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
		expect(response.headers.get("Location")).toBeNull();
		expect(_fetch).toHaveBeenCalledTimes(1);
	});
	it.each([null, "application/json", "image/png"])("rejects content type %s", async (type) => {
		_fetch.mockResolvedValue(new Response(Jpeg, { headers: type === null ? {} : { "Content-Type": type } }));
		expect((await _request()).status).toBe(502);
	});
	it("accepts case-insensitive JPEG content type with parameters", async () => {
		_fetch.mockResolvedValue(new Response(Jpeg, { headers: { "Content-Type": "IMAGE/JPEG; charset=binary" } }));
		const response = await _request();
		expect(response.status).toBe(200);
		await response.arrayBuffer();
	});
	it("rejects a missing provider body", async () => {
		_fetch.mockResolvedValue(new Response(null, { headers: { "Content-Type": "image/jpeg" } }));
		expect((await _request()).status).toBe(502);
	});
	it.each([new TypeError("private test-secret"), new DOMException("private", "NetworkError"), "private"])(
		"sanitizes network error %s",
		async (error) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			_fetch.mockRejectedValue(error);
			const response = await _request();
			expect(response.status).toBe(502);
			expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
			expect(log).not.toHaveBeenCalled();
		},
	);
	it.each(["TimeoutError", "AbortError"])("maps %s without retrying", async (name) => {
		const timeout = vi.spyOn(AbortSignal, "timeout");
		_fetch.mockRejectedValue(new DOMException("private", name));
		const response = await _request();
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_TIMEOUT" });
		expect(timeout).toHaveBeenCalledWith(10000);
		expect(_fetch).toHaveBeenCalledTimes(1);
	});
	it("clears failed coordination so a later request can retry", async () => {
		_fetch.mockRejectedValueOnce(new Error("private"));
		expect((await _request()).status).toBe(502);
		const response = await _request();
		expect(response.status).toBe(200);
		await response.arrayBuffer();
		expect(_fetch).toHaveBeenCalledTimes(2);
	});
	it("sanitizes unexpected coordinator exceptions", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(MapService.prototype, "generateImage").mockRejectedValue(new Error("private test-secret"));
		const response = await _request({ headers: { "x-request-id": "owned" } });
		expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR" });
		expect(log).toHaveBeenCalledExactlyOnceWith({ event: "geoimage.generation.failed", requestId: "owned" });
	});
	it("sanitizes unexpected service exceptions", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(ImageService.prototype, "getImage").mockRejectedValue(new Error("private test-secret"));
		const response = await _request({ headers: { "x-request-id": "owned" } });
		expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR" });
		expect(log).toHaveBeenCalledExactlyOnceWith({
			event: "geoimage.request.failed",
			requestId: "owned",
			responseStatus: 500,
		});
	});
});

it("keeps malformed HTTP requests sanitized without validation violations", async () => {
	vi.spyOn(ImageService.prototype, "getImage").mockRejectedValue(new HTTPException(400, { message: "private" }));
	const response = await _request();
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({ errorCode: "INVALID_REQUEST" });
});

it("does not expose the retired locations endpoint or generate images through it", async () => {
	const response = await app.request(`/v1/locations?${Query}`, {}, _bindings.env, _bindings.execution);
	expect(response.status).toBe(404);
	expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
	expect(_bindings.get).not.toHaveBeenCalled();
	expect(_fetch).not.toHaveBeenCalled();
});

it("generates a cold HEAD and reuses stored headers without exposing bytes or trace IDs", async () => {
	const head = await app.request(`/v1/images?${Query}`, { method: "HEAD" }, _bindings.env, _bindings.execution);
	expect(head.status).toBe(200);
	expect(head.headers.get("Content-Type")).toBe("image/jpeg");
	expect(head.headers.get("Content-Length")).toBe(String(Jpeg.length));
	expect(head.headers.get("x-request-id")).toBeNull();
	expect(await head.text()).toBe("");
	expect(_fetch).toHaveBeenCalledTimes(1);
	const stored = await app.request(
		`/v1/images?${Query}`,
		{ method: "HEAD" },
		{ ..._bindings.env, GEOAPIFY_API_KEY: "" },
		_bindings.execution,
	);
	expect(stored.status).toBe(200);
	expect(stored.headers.get("ETag")).toBe(head.headers.get("ETag"));
	expect(await stored.text()).toBe("");
	expect(_fetch).toHaveBeenCalledTimes(1);
});

it("keeps invalid HEAD requests noncacheable and traced without external operations", async () => {
	const response = await app.request(
		"/v1/images",
		{ method: "HEAD", headers: { "x-request-id": "invalid-head" } },
		_bindings.env,
		_bindings.execution,
	);
	expect(response.status).toBe(400);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("x-request-id")).toBe("invalid-head");
	expect(await response.text()).toBe("");
	expect(_bindings.get).not.toHaveBeenCalled();
	expect(_fetch).not.toHaveBeenCalled();
});
