import app from "./app";
import { LocationsService } from "./locations/locations.service";

const _input = { latitude: -23.5505, longitude: -46.6333, map: { size: { width: 480, height: 1280 } } };
const _env = { GEOAPIFY_API_KEY: "test-secret" };
const _jpeg = new Uint8Array([255, 216, 255, 217]);

function _request(params?: { body?: string; headers?: Record<string, string>; env?: Partial<GeovisualWorkerEnv> }) {
	return app.request(
		"/v1/locations",
		{
			method: "POST",
			headers: { "Content-Type": "application/json", ...params?.headers },
			body: params?.body ?? JSON.stringify(_input),
		},
		params?.env ?? _env,
	);
}

describe("Geovisual HTTP API", () => {
	const providerFetch = vi.fn<typeof fetch>();
	beforeEach(() => {
		vi.stubGlobal("fetch", providerFetch);
		providerFetch.mockResolvedValue(
			new Response(_jpeg, { headers: { "Content-Type": "image/jpeg", "x-provider-secret": "private" } }),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		providerFetch.mockReset();
	});

	it("streams JPEG bytes with owned headers and fixed native-language rendering settings", async () => {
		const response = await _request({ headers: { "Accept-Language": "en-US", "x-request-id": "local.request-1" } });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("x-request-id")).toBe("local.request-1");
		expect(response.headers.get("x-provider-secret")).toBeNull();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
		expect(providerFetch).toHaveBeenCalledTimes(1);
		const [url, options] = providerFetch.mock.calls[0]!;
		expect(url).toBeInstanceOf(URL);
		expect(String(url).split("?")[0]).toBe("https://maps.geoapify.com/v1/staticmap");
		expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({
			apiKey: "test-secret",
			center: "lonlat:-46.6333,-23.5505",
			style: "osm-bright",
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

	it("keeps injected provider credentials isolated between requests", async () => {
		const responses = await Promise.all([
			_request({ env: { GEOAPIFY_API_KEY: "first-key" } }),
			_request({ env: { GEOAPIFY_API_KEY: "second-key" } }),
		]);
		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		expect(providerFetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("apiKey")).sort()).toEqual([
			"first-key",
			"second-key",
		]);
	});

	it.each([
		{ size: { width: 480, height: 1280 }, density: 1 },
		{ size: { width: 480, height: 1280 }, density: 2 },
		{ size: { width: 480, height: 480 }, density: 1 },
		{ size: { width: 480, height: 480 }, density: 2 },
	])("preserves the logical viewport when requesting %j", async (rendering) => {
		const response = await _request({ body: JSON.stringify({ ..._input, map: { ..._input.map, ...rendering } }) });
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
		expect(providerFetch).toHaveBeenCalledTimes(1);
		const parameters = new URL(String(providerFetch.mock.calls[0]![0])).searchParams;
		expect(Object.fromEntries(parameters)).toEqual({
			apiKey: "test-secret",
			center: "lonlat:-46.6333,-23.5505",
			style: "osm-bright",
			width: String(rendering.size.width),
			height: String(rendering.size.height),
			scaleFactor: String(rendering.density),
			zoom: "13",
			format: "jpeg",
		});
	});

	it.each([
		{ size: undefined },
		{ size: "480x1280" },
		{ size: { width: 960, height: 2560 } },
		{ size: { width: 1280, height: 480 } },
		{ size: { width: 480, height: 960 } },
		{ size: { width: 480, height: 1280, name: "feed" } },
		{ density: 0 },
		{ density: 3 },
		{ density: "2" },
		{ density: null },
	])("rejects unsupported rendering input %j before calling Geoapify", async (rendering) => {
		const response = await _request({ body: JSON.stringify({ ..._input, map: { ..._input.map, ...rendering } }) });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ errorCode: "VALIDATION_ERROR", violations: expect.any(Array) });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each([
		{ latitude: 0, longitude: 0, size: { width: 480, height: 480 }, density: 1 },
		{ ..._input, map: undefined },
		{ ..._input, map: null },
		{ ..._input, map: {} },
		{ ..._input, map: { ..._input.map, zoom: 12 } },
		{ ..._input, density: 1 },
	])("rejects flat rendering options or an invalid map object %j", async (input) => {
		const response = await _request({ body: JSON.stringify(input) });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ errorCode: "VALIDATION_ERROR", violations: expect.any(Array) });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("returns 404 for the replaced maps endpoint without calling the provider", async () => {
		const response = await app.request(
			"/v1/maps",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(_input),
			},
			_env,
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("generates a JPEG with a redirect mode supported by the Workers runtime", async () => {
		providerFetch.mockImplementation(async (_url, options) => {
			// Workers accepts only follow/manual; Node's fetch also accepts error.
			if (options?.redirect !== "follow" && options?.redirect !== "manual") {
				throw new TypeError("Invalid redirect value");
			}
			return new Response(_jpeg, { headers: { "Content-Type": "image/jpeg" } });
		});
		const response = await _request();
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
	});

	it("rejects provider redirects without following them or exposing their location", async () => {
		providerFetch.mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: { Location: "https://example.test/private?apiKey=test-secret" },
			}),
		);
		const response = await _request();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
		expect(response.headers.get("Location")).toBeNull();
		expect(providerFetch).toHaveBeenCalledTimes(1);
	});

	it("returns headers before the entire image has arrived", async () => {
		let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
		providerFetch.mockResolvedValue(
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						streamController = controller;
					},
				}),
				{ headers: { "Content-Type": "image/jpeg" } },
			),
		);
		const response = await _request();
		expect(response.status).toBe(200);
		streamController!.enqueue(_jpeg);
		streamController!.close();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
	});

	it("accepts a JPEG content type with case differences and parameters", async () => {
		providerFetch.mockResolvedValue(new Response(_jpeg, { headers: { "Content-Type": "IMAGE/JPEG; charset=binary" } }));
		expect((await _request()).status).toBe(200);
	});

	it.each([undefined, "invalid id", "a".repeat(129)])(
		"generates a request ID when the supplied ID is %s",
		async (id) => {
			const response = await _request({ headers: id === undefined ? {} : { "x-request-id": id } });
			expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
		},
	);

	it.each([
		"null",
		"[]",
		"{}",
		'{"latitude":0}',
		'{"latitude":"0","longitude":0}',
		'{"latitude":91,"longitude":0}',
		'{"latitude":0,"longitude":181}',
		'{"latitude":0,"longitude":0,"jobId":"private"}',
	])("rejects invalid JSON input %s without calling the provider", async (body) => {
		const response = await _request({ body: body });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ errorCode: "VALIDATION_ERROR", violations: expect.any(Array) });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("keeps malformed JSON separate from field validation errors", async () => {
		const response = await _request({ body: "{" });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ errorCode: "INVALID_REQUEST" });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each(["text/plain", "application/json;broken", ""])(
		"keeps unsupported content type %s as INVALID_REQUEST",
		async (contentType) => {
			const response = await _request({ headers: { "Content-Type": contentType } });
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ errorCode: "INVALID_REQUEST" });
			expect(providerFetch).not.toHaveBeenCalled();
		},
	);

	it("keeps a missing content type as INVALID_REQUEST", async () => {
		const response = await app.request(
			"/v1/locations",
			{ method: "POST", body: new TextEncoder().encode(JSON.stringify(_input)) },
			_env,
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ errorCode: "INVALID_REQUEST" });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each(["application/json; charset=utf-8", "application/problem+json", "APPLICATION/JSON"])(
		"validates JSON content type %s",
		async (contentType) => {
			const response = await _request({
				headers: { "Content-Type": contentType },
				body: JSON.stringify({ ..._input, map: { ..._input.map, density: 3 } }),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				errorCode: "VALIDATION_ERROR",
				violations: [{ path: ["map", "density"], message: "Density must be 1 or 2." }],
			});
			expect(providerFetch).not.toHaveBeenCalled();
		},
	);

	it("reports multiple invalid coordinates and nested rendering options together", async () => {
		const response = await _request({
			body: JSON.stringify({ latitude: 91, longitude: 181, map: { size: { width: 480, height: 480 }, density: 3 } }),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			errorCode: "VALIDATION_ERROR",
			violations: [
				{ path: ["latitude"], message: expect.any(String) },
				{ path: ["longitude"], message: expect.any(String) },
				{ path: ["map", "density"], message: "Density must be 1 or 2." },
			],
		});
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("explains unsupported map sizes at the nested size path", async () => {
		const response = await _request({
			body: JSON.stringify({ ..._input, map: { size: { width: 999, height: 999 } } }),
		});
		expect(await response.json()).toEqual({
			errorCode: "VALIDATION_ERROR",
			violations: [{ path: ["map", "size"], message: "Map size must be 480 × 1280 or 480 × 480." }],
		});
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("identifies missing map options and unknown fields without echoing submitted values", async () => {
		const response = await _request({
			body: JSON.stringify({ latitude: 0, longitude: 0, jobId: "submitted-private-value" }),
		});
		const body: { errorCode: string; violations: { path: (string | number)[]; message: string }[] } =
			await response.json();
		expect(body.errorCode).toBe("VALIDATION_ERROR");
		expect(body.violations.map((violation) => violation.path)).toEqual([["map"], []]);
		expect(body.violations.every((violation) => violation.message.length > 0)).toBe(true);
		expect(JSON.stringify(body)).not.toContain("submitted-private-value");
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each([false, true])("rejects oversized bodies with content length present: %s", async (withLength) => {
		const body = " ".repeat(4097);
		const response = await _request({
			body: body,
			headers: withLength ? { "Content-Length": String(body.length) } : {},
		});
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ errorCode: "PAYLOAD_TOO_LARGE" });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each(["GET", "HEAD"])("serves %s health without credentials or provider calls", async (method) => {
		const response = await app.request("/v1/health", { method: method }, {});
		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it.each(["GET", "PUT", "DELETE", "OPTIONS"])("rejects %s on locations with Allow", async (method) => {
		const response = await app.request("/v1/locations", { method: method }, _env);
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("POST");
		expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED" });
		expect(providerFetch).not.toHaveBeenCalled();
	});

	it("rejects unsupported health methods", async () => {
		const response = await app.request("/v1/health", { method: "POST" }, _env);
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, HEAD");
	});

	it("returns an owned not-found response", async () => {
		const response = await app.request("/missing", {}, _env);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ errorCode: "ROUTE_NOT_FOUND" });
	});

	it.each([{}, { GEOAPIFY_API_KEY: "" }, { GEOAPIFY_API_KEY: "   " }])(
		"rejects missing credentials before calling the provider",
		async (env) => {
			const response = await _request({ env: env });
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR" });
			expect(providerFetch).not.toHaveBeenCalled();
		},
	);

	it.each([400, 401, 403, 429, 500, 503])("sanitizes upstream status %s without retrying", async (status) => {
		providerFetch.mockResolvedValue(
			new Response("test-secret private provider error", { status: status, headers: { "Content-Type": "image/jpeg" } }),
		);
		const response = await _request();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
		expect(providerFetch).toHaveBeenCalledTimes(1);
	});

	it.each([null, "application/json", "image/png"])("rejects unexpected upstream content type %s", async (type) => {
		providerFetch.mockResolvedValue(new Response(_jpeg, { headers: type === null ? {} : { "Content-Type": type } }));
		const response = await _request();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
	});

	it("rejects a missing provider body", async () => {
		providerFetch.mockResolvedValue(new Response(null, { headers: { "Content-Type": "image/jpeg" } }));
		expect((await _request()).status).toBe(502);
	});

	it.each([new TypeError("test-secret"), new DOMException("private", "NetworkError"), "private failure"])(
		"sanitizes network failures without logging secrets",
		async (error) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			providerFetch.mockRejectedValue(error);
			const response = await _request();
			expect(response.status).toBe(502);
			expect(await response.json()).toEqual({ errorCode: "PROVIDER_UNAVAILABLE" });
			expect(log).not.toHaveBeenCalled();
		},
	);

	it.each(["TimeoutError", "AbortError"])("maps %s to an owned timeout after a single attempt", async (name) => {
		const timeout = vi.spyOn(AbortSignal, "timeout");
		providerFetch.mockRejectedValue(new DOMException("test-secret", name));
		const response = await _request();
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ errorCode: "PROVIDER_TIMEOUT" });
		expect(timeout).toHaveBeenCalledWith(10_000);
		expect(providerFetch).toHaveBeenCalledTimes(1);
	});

	it("sanitizes unexpected internal errors in responses and logs", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(LocationsService.prototype, "generateLocationVisual").mockRejectedValue(
			new Error("private test-secret stack"),
		);
		const response = await _request({ headers: { "x-request-id": "owned-request" } });
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR" });
		expect(log).toHaveBeenCalledExactlyOnceWith({
			event: "geovisual.request.failed",
			requestId: "owned-request",
			responseStatus: 500,
		});
	});
});
