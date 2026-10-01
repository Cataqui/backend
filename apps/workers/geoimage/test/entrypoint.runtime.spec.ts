import { getImagePermissionJwks, permissionHeadersForUrl } from "./image-permission";
// The local runtime does not emulate Workers Cache in front of the entrypoint.
// These tests verify HTTP dispatch and durable reuse; deployed cache-hit bypass
// must be checked separately using CF-Cache-Status and Worker invocation metrics.
import { exports } from "cloudflare:workers";

const _jpeg = new Uint8Array([255, 216, 255, 217]);
const _provider = vi.fn(
	async (_request: RequestInfo | URL) => new Response(_jpeg, { headers: { "Content-Type": "image/jpeg" } }),
);

beforeEach(() => {
	_provider.mockClear();
	vi.stubGlobal("fetch", async (request: RequestInfo | URL) => {
		const url = new URL(request instanceof Request ? request.url : String(request));
		if (url.pathname.endsWith("/jwks")) return Response.json(await getImagePermissionJwks());
		return _provider(request);
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("serves cache-ready GET and HEAD through the runtime entrypoint with durable reuse", async () => {
	const url = "https://geoimage.test/v1/images?latitude=10&longitude=10&size=480x480&density=1";
	const first = await exports.default.fetch(url, {
		headers: { ...(await permissionHeadersForUrl(url)), "x-request-id": "first" },
	});
	expect(first.status).toBe(200);
	expect(new Uint8Array(await first.arrayBuffer())).toEqual(_jpeg);
	expect(first.headers.get("x-request-id")).toBeNull();
	for (const method of ["GET", "HEAD"]) {
		const response = await exports.default.fetch(url, {
			method: method,
			headers: { ...(await permissionHeadersForUrl(url)), "x-request-id": "second", Cookie: "visitor=other" },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBeNull();
		expect(response.headers.get("Set-Cookie")).toBeNull();
		if (method === "HEAD") expect(await response.text()).toBe("");
		else expect(new Uint8Array(await response.arrayBuffer())).toEqual(_jpeg);
	}
	expect(_provider).toHaveBeenCalledTimes(1);
}, 30000);

it("persists cold HEAD for later GET and keeps different image options distinct", async () => {
	const url = "https://geoimage.test/v1/images?latitude=11&longitude=11&size=480x480&density=1";
	const head = await exports.default.fetch(url, { method: "HEAD", headers: await permissionHeadersForUrl(url) });
	expect(head.status).toBe(200);
	expect(await head.text()).toBe("");
	const get = await exports.default.fetch(url, { headers: await permissionHeadersForUrl(url) });
	expect(new Uint8Array(await get.arrayBuffer())).toEqual(_jpeg);
	const different = await exports.default.fetch(url.replace("density=1", "density=2"), {
		headers: await permissionHeadersForUrl(url),
	});
	expect(different.status).toBe(200);
	await different.arrayBuffer();
	expect(_provider).toHaveBeenCalledTimes(2);
}, 30000);

it("does not cache errors and keeps a fresh request ID on each failure", async () => {
	for (const id of ["error-one", "error-two"]) {
		const response = await exports.default.fetch("https://geoimage.test/v1/images?latitude=999", {
			headers: { "x-request-id": id },
		});
		expect(response.status).toBe(400);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("x-request-id")).toBe(id);
		await response.arrayBuffer();
	}
	expect(_provider).not.toHaveBeenCalled();
});
