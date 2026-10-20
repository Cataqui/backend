import { Buffer } from "node:buffer";
import * as td from "testdouble";
import { LocationReferenceService } from "./location-reference.service";

const _center = { latitude: -23.5505, longitude: -46.6333 };
const _reference =
	"eyJ2ZXJzaW9uIjoxLCJlbnZpcm9ubWVudCI6InN0YWdpbmciLCJjZW50ZXIiOnsibGF0aXR1ZGUiOi0yMy41NTA1LCJsb25naXR1ZGUiOi00Ni42MzMzfX0x_CGNNgHAsaA_2DzkkVpmfsDQXpPJrDV9a-_KemF2vQ";
const _url = `https://staging.maps.cataqui.com/static/v1/${_reference}.webp`;
const _service = new LocationReferenceService({
	environment: "staging",
	signingKey: "A".repeat(43),
	baseUrl: "https://staging.maps.cataqui.com",
});

async function _sign(bytes: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
	const signature = await crypto.subtle.sign("HMAC", key, Uint8Array.from(bytes));
	return Buffer.concat([bytes, Buffer.from(signature)]).toString("base64url");
}

afterEach(() => td.reset());
afterEach(() => vi.restoreAllMocks());

it("preserves the existing signed location URL", async () => {
	expect(await _service.createUrl(_center)).toEqual({ url: _url });
});

it("reads an existing signed location reference", async () => {
	const reference = new URL(_url).pathname.slice("/static/v1/".length, -".webp".length);
	expect(await _service.read(reference)).toEqual(_center);
});

it("uses the configured base URL for local development", async () => {
	const service = new LocationReferenceService({
		environment: "staging",
		signingKey: "A".repeat(43),
		baseUrl: "http://localhost:8787",
	});
	expect(await service.createUrl(_center)).toEqual({ url: `http://localhost:8787/static/v1/${_reference}.webp` });
});

it("propagates signing failure", async () => {
	const failure = new Error("signing failed");
	const sign = td.replace(crypto.subtle, "sign");
	td.when(sign(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReject(failure);
	await expect(_service.createUrl(_center)).rejects.toBe(failure);
});

it.each(["", "invalid", ".invalid.", Buffer.alloc(32).toString("base64url")])(
	"rejects malformed or incomplete reference %s",
	async (reference) => {
		expect(await _service.read(reference)).toBeNull();
	},
);

it("rejects alternate base64url pad bits before signature verification", async () => {
	const reference = await _sign(new TextEncoder().encode("{}"));
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
	const alternate = reference.slice(0, -1) + alphabet[alphabet.indexOf(reference.at(-1)!) + 1];
	expect(Buffer.from(alternate, "base64url")).toEqual(Buffer.from(reference, "base64url"));
	const verify = vi.spyOn(crypto.subtle, "verify");
	expect(await _service.read(alternate)).toBeNull();
	expect(verify).not.toHaveBeenCalled();
});

it("rejects a forged signature", async () => {
	const bytes = Buffer.from(_reference, "base64url");
	bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
	expect(await _service.read(bytes.toString("base64url"))).toBeNull();
});

it.each([
	{ version: 3, environment: "staging", center: _center },
	{ version: 1, environment: "production", center: _center },
	{ version: 1, environment: "staging", center: { latitude: 90, longitude: 0 } },
	{ version: 1, environment: "staging", center: _center, privateJobId: "private" },
])("rejects a signed incompatible payload %j", async (payload) => {
	const reference = await _sign(new TextEncoder().encode(JSON.stringify(payload)));
	expect(await _service.read(reference)).toBeNull();
});

it.each([
	new TextEncoder().encode("not JSON"),
	new Uint8Array([0xff, 0xff]),
	new TextEncoder().encode('\uFEFF{"version":1,"environment":"staging","center":{"latitude":0,"longitude":0}}'),
])("rejects signed invalid JSON or UTF8 %#", async (bytes) => {
	expect(await _service.read(await _sign(bytes))).toBeNull();
});
