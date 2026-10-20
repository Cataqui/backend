import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import { tsyringe } from "@hono/tsyringe";
import * as td from "testdouble";
import { Hono } from "hono";
import { createMapsErrorResponseFromError } from "../http/maps-error.handler";
import { MapsErrorCode } from "../errors/maps-error-code.enum";
import type { MapsContext } from "../http/context";
import { TransformationUnavailableError } from "./errors/transformation-unavailable.error";
import { staticRoutes } from "./static.routes";
import type { GenerateStaticImageOutput } from "./static.repository";
import { StaticService } from "./static.service";

afterEach(() => td.reset());

const _reference = "cHVibGljLXJlZmVyZW5jZQ";
const _path = `/static/v1/${_reference}.webp?size=480x480`;
const _image = {
	bytes: new Uint8Array([119, 101, 98, 112]),
	contentType: "image/webp",
	digest: "b".repeat(64),
} satisfies GenerateStaticImageOutput;
const _etag = `W/"${_image.digest}"`;
let _service: StaticService;
let _env: MapsWorkerEnv;
let _context: ExecutionContext;
const _app = new Hono<MapsContext>();
_app.use("*", async (context, next) => {
	context.set("requestId", "request-1");
	await next();
});
_app.use(
	"*",
	tsyringe((scope) => scope.registerInstance(StaticService, _service)),
);
_app.route("/static", staticRoutes);
_app.onError((error, context) => createMapsErrorResponseFromError({ context: context, error: error }));

function _request(params: { path?: string; init?: RequestInit } = {}): Promise<Response> | Response {
	return _app.request(params.path ?? _path, params.init, _env, _context);
}

beforeEach(() => {
	_service = td.object<StaticService>();
	_env = td.object<MapsWorkerEnv>();
	_context = Object.assign(td.object<ExecutionContext>(), { props: {} });
	td.when(_service.generateImage(td.matchers.anything())).thenResolve(_image);
});

it("returns image bytes with native freshness and stale-on-error directives", async () => {
	const response = await _request();
	expect({
		status: response.status,
		body: await response.text(),
		contentType: response.headers.get("Content-Type"),
		cacheControl: response.headers.get("Cache-Control"),
		etag: response.headers.get("ETag"),
		nosniff: response.headers.get("X-Content-Type-Options"),
		contentLength: response.headers.get("Content-Length"),
		lastModified: response.headers.get("Last-Modified"),
	}).toEqual({
		status: 200,
		body: "webp",
		contentType: "image/webp",
		cacheControl: "public, max-age=31536000, stale-if-error=31536000",
		etag: _etag,
		nosniff: "nosniff",
		contentLength: null,
		lastModified: null,
	});
});

it.each([480, 1280])("passes the URL's supported size for height %s", async (height) => {
	const response = await _request({ path: `/static/v1/${_reference}.webp?size=480x${height}` });
	expect(response.status).toBe(200);
	expect(td.explain(_service.generateImage).calls.map((call) => call.args)).toEqual([
		[{ reference: _reference, size: `480x${height}`, signal: expect.any(AbortSignal) }],
	]);
});

it.each([_etag, `"${_image.digest}"`, `"other", ${_etag}`, ` W/"other" , "${_image.digest}" `, "*", " * "])(
	"weakly matches If-None-Match %s against the rendered image",
	async (condition) => {
		const response = await _request({ init: { headers: { "If-None-Match": condition } } });
		expect({
			status: response.status,
			body: await response.text(),
			etag: response.headers.get("ETag"),
			cacheControl: response.headers.get("Cache-Control"),
			nosniff: response.headers.get("X-Content-Type-Options"),
		}).toEqual({
			status: 304,
			body: "",
			etag: _etag,
			cacheControl: "public, max-age=31536000, stale-if-error=31536000",
			nosniff: "nosniff",
		});
	},
);

it.each(['"different"', 'W/"different"', "unquoted", '"different", W/"unrelated"', ""])(
	"returns the image for nonmatching tag %s",
	async (condition) => {
		const response = await _request({ init: { headers: { "If-None-Match": condition } } });
		expect({ status: response.status, body: await response.text() }).toEqual({ status: 200, body: "webp" });
	},
);

it.each([undefined, `"${_image.digest}"`, "*"])(
	"returns HEAD metadata without a body for condition %s",
	async (condition) => {
		const response = await _request({
			init: { method: "HEAD", headers: condition === undefined ? {} : { "If-None-Match": condition } },
		});
		expect({
			status: response.status,
			body: await response.text(),
			etag: response.headers.get("ETag"),
			cacheControl: response.headers.get("Cache-Control"),
		}).toEqual({
			status: condition === undefined ? 200 : 304,
			body: "",
			etag: _etag,
			cacheControl: "public, max-age=31536000, stale-if-error=31536000",
		});
		expect(td.explain(_service.generateImage).callCount).toBe(1);
	},
);

it("ignores modification dates because no Last-Modified value is provided", async () => {
	const response = await _request({ init: { headers: { "If-Modified-Since": new Date("2099-01-01").toUTCString() } } });
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("webp");
});

it("does not return 304 for a rejected signed reference", async () => {
	td.when(_service.generateImage(td.matchers.anything())).thenResolve(null);
	const response = await _request({ init: { headers: { "If-None-Match": "*" } } });
	expect(response.status).toBe(404);
	expect(await response.json()).toMatchObject({ errorCode: MapsErrorCode.IMAGE_NOT_FOUND });
});

it.each(["POST", "QUERY", "DELETE", "PATCH", "OPTIONS"])("rejects %s before calling the service", async (method) => {
	const response = await _request({ init: { method: method } });
	expect({
		status: response.status,
		allow: response.headers.get("Allow"),
		calls: td.explain(_service.generateImage).callCount,
	}).toEqual({ status: 405, allow: "GET, HEAD", calls: 0 });
});

it.each([
	_path.replace(_reference, "invalid.reference"),
	_path.replace("480x480", "480x600"),
	_path.replace("480x480", "0480x480"),
	_path.replace("?size=480x480", ""),
	...[
		"size=360x720",
		"size=480x480",
		"size=480x1280",
		"scale=2",
		"zoom=12",
		"latitude=0&longitude=0",
		"extra=1&extra=2",
	].map((query) => `${_path}&${query}`),
])("rejects invalid selectors %s before calling the service", async (path) => {
	const response = await _request({ path: path, init: { headers: { "If-None-Match": "*" } } });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({
		errorCode: MapsErrorCode.INVALID_REQUEST,
		violations: expect.any(Array),
	});
	expect(td.explain(_service.generateImage).callCount).toBe(0);
});

it("returns rendering failure so Cloudflare can handle the refresh failure", async () => {
	td.when(_service.generateImage(td.matchers.anything())).thenReject(new TransformationUnavailableError());
	const response = await _request({ init: { headers: { "If-None-Match": _etag } } });
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({
		status: 503,
		errorCode: MapsErrorCode.TRANSFORMATION_UNAVAILABLE,
		message: "The static map could not be prepared.",
	});
});

it("forwards request cancellation to the service", async () => {
	const controller = new AbortController();
	await _request({ init: { signal: controller.signal } });
	const input: Parameters<StaticService["generateImage"]>[0] | undefined = td.explain(_service.generateImage).calls[0]
		?.args[0];
	controller.abort();
	expect(input?.signal?.aborted).toBe(true);
});

it.each([
	"/static?latitude=0&longitude=0",
	`/static/${_image.digest}?size=480x480`,
	_path.replace("/v1/", "/v2/"),
	`/static/scenes/${_image.digest}.webp`,
	`/static/attribution/${_image.digest}.png`,
])("does not expose unsigned coordinate generation at %s", async (path) => {
	const response = await _request({ path: path });
	expect(response.status).toBe(404);
	expect(td.explain(_service.generateImage).callCount).toBe(0);
});

it("does not forward Authorization to image generation", async () => {
	await _request({ init: { headers: { Authorization: "Bearer unrelated.token.signature" } } });
	expect(td.explain(_service.generateImage).calls[0]?.args[0]).not.toHaveProperty("token");
});
