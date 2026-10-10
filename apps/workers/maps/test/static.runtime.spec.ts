import { env, exports } from "cloudflare:workers";

import { getStaticIdentity } from "../src/modules/static/static-identity";
const assetId = "b".repeat(64);
const key = `static/${await getStaticIdentity({ assetId: assetId, size: { width: 480, height: 480 }, scale: 2, zoom: 13 })}.webp`;
const url = `https://maps.test/static/${assetId}?size=480x480&scale=2&zoom=13`;

beforeEach(async () => {
	await env.STATIC_IMAGES.put(key, new Uint8Array([82, 73, 70, 70]), {
		httpMetadata: { contentType: "image/webp" },
	});
});
afterEach(async () => {
	await env.STATIC_IMAGES.delete(key);
});

it("serves stored bytes through the public static route without a token", async () => {
	const response = await exports.default.fetch(url);
	expect(response.status).toBe(200);
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
});
it("uses native R2 conditional reads for a matching entity tag", async () => {
	const first = await exports.default.fetch(url);
	await first.arrayBuffer();
	const response = await exports.default.fetch(url, { headers: { "If-None-Match": first.headers.get("ETag") ?? "" } });
	expect(response.status).toBe(304);
	expect(await response.text()).toBe("");
});
it("honors If-None-Match precedence over modification dates", async () => {
	const response = await exports.default.fetch(url, {
		headers: { "If-None-Match": '"different"', "If-Modified-Since": new Date(Date.now() + 60_000).toUTCString() },
	});
	expect(response.status).toBe(200);
	await response.arrayBuffer();
});
it("returns a conditional response for an unchanged modification date", async () => {
	const response = await exports.default.fetch(url, {
		headers: { "If-Modified-Since": new Date(Date.now() + 60_000).toUTCString() },
	});
	expect(response.status).toBe(304);
});
it("returns metadata without bytes for HEAD", async () => {
	const response = await exports.default.fetch(url, { method: "HEAD" });
	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Length")).toBe("4");
	expect(await response.text()).toBe("");
});
it("does not cache missing image responses", async () => {
	await env.STATIC_IMAGES.delete(key);
	const response = await exports.default.fetch(url);
	expect(response.status).toBe(404);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("serves distinct prepared bytes for two sizes of the same asset", async () => {
	const tallKey = `static/${await getStaticIdentity({ assetId: assetId, size: { width: 480, height: 1280 }, scale: 2, zoom: 13 })}.webp`;
	await env.STATIC_IMAGES.put(tallKey, new Uint8Array([1, 2, 3]));
	try {
		const square = await exports.default.fetch(url);
		const tall = await exports.default.fetch(url.replace("480x480", "480x1280"));
		expect([
			Array.from(new Uint8Array(await square.arrayBuffer())),
			Array.from(new Uint8Array(await tall.arrayBuffer())),
		]).toEqual([
			[82, 73, 70, 70],
			[1, 2, 3],
		]);
	} finally {
		await env.STATIC_IMAGES.delete(tallKey);
	}
});
