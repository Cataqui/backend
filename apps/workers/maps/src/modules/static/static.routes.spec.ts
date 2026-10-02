import app from "../../app";
import { StaticRepository } from "./static.repository";
import { MapsError } from "../../shared/maps.error";
import { MapsErrorCode } from "../../shared/maps-error-code.enum";

vi.mock("./static.repository");
import { getStaticIdentity } from "./static-identity";
const id = "a".repeat(64);
const file = `${await getStaticIdentity({ assetId: id, size: { width: 480, height: 480 }, scale: 2, zoom: 13 })}.webp`;
const path = `/static/${id}?size=480x480`;
const env = {} as MapsWorkerEnv;
beforeEach(() => vi.resetAllMocks());

it("serves a hash-only WebP URL without login or invoking generation", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue({
		kind: "body",
		body: new Response("webp").body!,
		etag: '"abc"',
		uploaded: new Date(0),
		size: 4,
	});
	const response = await app.request(path, {}, env);
	expect({
		status: response.status,
		body: await response.text(),
		cache: response.headers.get("Cache-Control"),
		contentType: response.headers.get("Content-Type"),
		etag: response.headers.get("ETag"),
		encode: vi.mocked(StaticRepository.prototype.encode).mock.calls,
		writes: vi.mocked(StaticRepository.prototype.upload).mock.calls,
	}).toEqual({
		status: 200,
		body: "webp",
		cache: "public, max-age=31536000, immutable",
		contentType: "image/webp",
		etag: '"abc"',
		encode: [],
		writes: [],
	});
});
it("returns an uncached 404 for missing images without attempting preparation", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue(null);
	const response = await app.request(path, {}, env);
	expect({
		status: response.status,
		cache: response.headers.get("Cache-Control"),
		encode: vi.mocked(StaticRepository.prototype.encode).mock.calls,
		writes: vi.mocked(StaticRepository.prototype.upload).mock.calls,
	}).toEqual({ status: 404, cache: "no-store", encode: [], writes: [] });
});
it("returns only headers for HEAD and cancels the unused body", async () => {
	const cancel = vi.fn();
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue({
		kind: "body",
		body: new ReadableStream({ cancel: cancel }),
		etag: '"abc"',
		uploaded: new Date(0),
		size: 4,
	});
	const response = await app.request(path, { method: "HEAD" }, env);
	expect({
		status: response.status,
		body: await response.text(),
		length: response.headers.get("Content-Length"),
		cancelled: cancel.mock.calls.length,
	}).toEqual({ status: 200, body: "", length: "4", cancelled: 1 });
});
it("returns 304 when the stored image satisfies the client condition", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue({
		kind: "not-modified",
		etag: '"abc"',
		uploaded: new Date(0),
		size: 4,
	});
	const response = await app.request(path, { headers: { "If-None-Match": '"abc"' } }, env);
	expect({
		status: response.status,
		body: await response.text(),
		calls: vi.mocked(StaticRepository.prototype.read).mock.calls,
	}).toEqual({
		status: 304,
		body: "",
		calls: [[{ key: `static/${file}`, etagDoesNotMatch: '"abc"', uploadedAfter: undefined }]],
	});
});
it("passes a valid modification date to storage", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue(null);
	await app.request(path, { headers: { "If-Modified-Since": new Date(0).toUTCString() } }, env);
	expect(StaticRepository.prototype.read).toHaveBeenCalledWith({
		key: `static/${file}`,
		etagDoesNotMatch: undefined,
		uploadedAfter: new Date(0),
	});
});
it("ignores an invalid modification date", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue(null);
	await app.request(path, { headers: { "If-Modified-Since": "invalid" } }, env);
	expect(StaticRepository.prototype.read).toHaveBeenCalledWith({
		key: `static/${file}`,
		etagDoesNotMatch: undefined,
		uploadedAfter: undefined,
	});
});
it.each(["/static/not-a-map.webp", `/static/${"A".repeat(64)}.webp`, `/static/${"a".repeat(64)}.png`])(
	"rejects malformed static references at %s before reading storage",
	async (url) => {
		const response = await app.request(url, {}, env);
		expect({
			status: response.status,
			cache: response.headers.get("Cache-Control"),
			reads: vi.mocked(StaticRepository.prototype.read).mock.calls,
		}).toEqual({ status: 400, cache: "no-store", reads: [] });
	},
);
it.each(["POST", "QUERY", "DELETE"])("rejects %s static requests without touching storage", async (method) => {
	const response = await app.request(path, { method: method }, env);
	expect({
		status: response.status,
		allow: response.headers.get("Allow"),
		reads: vi.mocked(StaticRepository.prototype.read).mock.calls,
	}).toEqual({ status: 405, allow: "GET, HEAD", reads: [] });
});
it("returns a sanitized uncached service error when storage fails", async () => {
	vi.mocked(StaticRepository.prototype.read).mockRejectedValue(
		new MapsError({ errorCode: MapsErrorCode.STORAGE_UNAVAILABLE, retryable: true }),
	);
	const response = await app.request(path, {}, env);
	expect({
		status: response.status,
		body: await response.json(),
		cache: response.headers.get("Cache-Control"),
	}).toEqual({
		status: 503,
		body: { errorCode: "STORAGE_UNAVAILABLE", message: "The stored map is temporarily unavailable." },
		cache: "no-store",
	});
});
it("rejects coordinate-based generation on the public endpoint", async () => {
	const response = await app.request("/static?latitude=0&longitude=0", {}, env);
	expect({
		status: response.status,
		reads: vi.mocked(StaticRepository.prototype.read).mock.calls,
		encode: vi.mocked(StaticRepository.prototype.encode).mock.calls,
	}).toEqual({ status: 404, reads: [], encode: [] });
});

it.each(["size=320x320", "size=480x480&scale=1", "size=480x480&zoom=14"])(
	"returns 404 for an unavailable variant %s without provider or storage work",
	async (query) => {
		const response = await app.request(`/static/${id}?${query}`, {}, env);
		expect(response.status).toBe(404);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(StaticRepository.prototype.read).not.toHaveBeenCalled();
		expect(StaticRepository.prototype.encode).not.toHaveBeenCalled();
	},
);
it.each([
	"",
	"size=bad",
	"size=0x480",
	"size=480x480&scale=bad",
	"size=480x480&zoom=-1",
	"size=480x480&extra=1",
	"size=480x480&size=480x1280",
])("rejects malformed variant query %s", async (query) => {
	const response = await app.request(`/static/${id}?${query}`, {}, env);
	expect(response.status).toBe(400);
	expect(StaticRepository.prototype.read).not.toHaveBeenCalled();
});
it("resolves default and explicit selectors to the same key and isolates the tall variant", async () => {
	vi.mocked(StaticRepository.prototype.read).mockResolvedValue(null);
	for (const query of ["size=480x480", "size=480x480&scale=2&zoom=13", "size=480x1280&scale=2&zoom=13"])
		await app.request(`/static/${id}?${query}`, {}, env);
	const calls = vi.mocked(StaticRepository.prototype.read).mock.calls;
	expect(calls[0]?.[0].key).toBe(calls[1]?.[0].key);
	expect(calls[2]?.[0].key).not.toBe(calls[0]?.[0].key);
});
