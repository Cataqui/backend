import type { writeFile } from "node:fs/promises";
import type { IMapshotRpc } from "./mapshot-rpc.interface";
import type sharp from "sharp";
import type { Metadata, OutputInfo, Sharp } from "sharp";
import * as td from "testdouble";
import type { getPlatformProxy, PlatformProxy } from "wrangler";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { _getPlatformProxy, _writeFile, _sharp } = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		_getPlatformProxy: td.func<typeof getPlatformProxy>(),
		_writeFile: td.func<typeof writeFile>(),
		_sharp: td.func<typeof sharp>(),
	};
});
vi.mock("wrangler", () => ({ getPlatformProxy: _getPlatformProxy }));
vi.mock("node:fs/promises", () => ({ writeFile: _writeFile }));
vi.mock("sharp", () => ({ default: _sharp }));

afterEach(() => td.reset());

const _arguments = process.argv;
const _exitCode = process.exitCode;
const _bytes = new Uint8Array([1]);
let _output: Awaited<ReturnType<IMapshotRpc["render"]>>;
let _mapshot: IMapshotRpc;
let _proxy: PlatformProxy<{ MAPSHOT: IMapshotRpc }>;
let _image: Sharp;
let _raw: Sharp;
const _metadata: Metadata = {
	format: "webp",
	width: 960,
	height: 960,
	autoOrient: { width: 960, height: 960 },
	space: "srgb",
	channels: 3,
	depth: "uchar",
	isProgressive: false,
	isPalette: false,
	hasProfile: false,
	hasAlpha: false,
};
const _decoded: { info: OutputInfo; data: Buffer<ArrayBuffer> } = {
	info: { format: "raw", width: 960, height: 960, channels: 3, size: 3, premultiplied: false, hasAlpha: false },
	data: Buffer.from([1, 2, 3]),
};

beforeEach(() => {
	vi.resetModules();
	vi.useFakeTimers();
	process.argv = ["node", "probe-mapshot-sdk.ts", "/private/probe.json", "/private/render.json"];
	process.exitCode = undefined;
	_output = {
		bytes: new ReadableStream<Uint8Array>({
			start(controller): void {
				controller.enqueue(_bytes);
				controller.close();
			},
		}),
		contentType: "image/webp",
		width: 960,
		height: 960,
		digest: "a".repeat(64),
	};
	_mapshot = td.object<IMapshotRpc>();
	_proxy = td.object<PlatformProxy<{ MAPSHOT: IMapshotRpc }>>();
	_proxy.env = { MAPSHOT: _mapshot };
	_image = td.object<Sharp>();
	_raw = td.object<Sharp>();
	td.replace(console, "error", td.func<typeof console.error>());
	td.when(_getPlatformProxy<{ MAPSHOT: IMapshotRpc }>(td.matchers.anything())).thenResolve(_proxy);
	td.when(_mapshot.render(td.matchers.anything())).thenResolve(_output);
	td.when(_proxy.dispose()).thenResolve(undefined);
	td.when(_raw.toBuffer({ resolveWithObject: true })).thenResolve(_decoded);
	td.when(_image.metadata()).thenResolve(_metadata);
	td.when(_image.raw()).thenReturn(_raw);
	td.when(_sharp(td.matchers.anything())).thenReturn(_image);
	td.when(_writeFile(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenResolve(undefined);
});

afterEach(() => {
	process.argv = _arguments;
	process.exitCode = _exitCode;
	vi.useRealTimers();
});

it("checks the normal rendering RPC and records fully decoded image dimensions", async () => {
	await import("./probe-mapshot-sdk");
	expect(td.explain(_getPlatformProxy).calls.map((call) => call.args)).toEqual([
		[{ configPath: "/private/probe.json", persist: false }],
	]);
	expect(td.explain(_mapshot.render).calls.map((call) => call.args)).toEqual([
		[
			{
				center: { latitude: -23.5505, longitude: -46.6333 },
				zoom: 13,
				size: { width: 480, height: 480 },
			},
		],
	]);
	expect(td.explain(_sharp).calls.map((call) => call.args)).toEqual([[_bytes]]);
	expect(td.explain(_raw.toBuffer).calls.map((call) => call.args)).toEqual([[{ resolveWithObject: true }]]);
	expect(td.explain(_writeFile).calls.map((call) => call.args)).toEqual([
		["/private/render.json", JSON.stringify({ width: 960, height: 960, bytes: 3 }), { flag: "wx", mode: 0o600 }],
	]);
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(process.exitCode).toBeUndefined();
});

it("fails before connecting when private probe paths are missing", async () => {
	process.argv = ["node", "probe-mapshot-sdk.ts"];
	await import("./probe-mapshot-sdk");
	expect(td.explain(_getPlatformProxy).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});

it("sanitizes remote setup failures without creating a proof file", async () => {
	td.when(_getPlatformProxy(td.matchers.anything()), { times: 1 }).thenReject(new Error("private provider failure"));
	await import("./probe-mapshot-sdk");
	expect(td.explain(console.error).calls.map((call) => call.args)).toEqual([["Live Mapshot SDK probe failed."]]);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});

it("disposes its proxy when the live render fails", async () => {
	td.when(_mapshot.render(td.matchers.anything()), { times: 1 }).thenReject(new Error("private render failure"));
	await import("./probe-mapshot-sdk");
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});

it("rejects malformed render output before decoding or writing the image", async () => {
	td.when(_mapshot.render(td.matchers.anything()), { times: 1 }).thenDo(
		async (): Promise<unknown> => ({
			..._output,
			contentType: "invalid",
		}),
	);
	await import("./probe-mapshot-sdk");
	expect(td.explain(_sharp).callCount).toBe(0);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(process.exitCode).toBe(1);
});

it("rejects images that cannot be decoded and disposes its proxy", async () => {
	td.when(_raw.toBuffer({ resolveWithObject: true }), { times: 1 }).thenReject(new Error("Invalid image"));
	await import("./probe-mapshot-sdk");
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(process.exitCode).toBe(1);
});

it("fails closed when the private proof file cannot be written", async () => {
	td.when(_writeFile(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), { times: 1 }).thenReject(
		new Error("File exists"),
	);
	await import("./probe-mapshot-sdk");
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(process.exitCode).toBe(1);
});

it("disposes a proxy that finishes setup after the deployment probe times out", async () => {
	const entered = Promise.withResolvers<void>();
	const setup = Promise.withResolvers<PlatformProxy<{ MAPSHOT: IMapshotRpc }>>();
	td.when(_getPlatformProxy(td.matchers.anything()), { times: 1 }).thenDo(
		(): Promise<PlatformProxy<{ MAPSHOT: IMapshotRpc }>> => {
			entered.resolve();
			return setup.promise;
		},
	);
	const execution = import("./probe-mapshot-sdk");
	await entered.promise;
	await vi.advanceTimersByTimeAsync(120_000);
	await execution;
	expect(process.exitCode).toBe(1);
	expect(td.explain(_proxy.dispose).callCount).toBe(0);
	setup.resolve(_proxy);
	await vi.waitFor(() => expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]));
	expect(td.explain(_mapshot.render).callCount).toBe(0);
	expect(td.explain(_writeFile).callCount).toBe(0);
});

it("rejects a non-WebP image even when the render declares WebP", async () => {
	td.when(_image.metadata(), { times: 1 }).thenResolve({ ..._metadata, format: "png" } satisfies Metadata);
	await import("./probe-mapshot-sdk");
	expect(td.explain(_raw.toBuffer).callCount).toBe(0);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(process.exitCode).toBe(1);
});

it("fails and disposes its proxy when rendering exceeds the deployment timeout", async () => {
	const entered = Promise.withResolvers<void>();
	td.when(_mapshot.render(td.matchers.anything()), { times: 1 }).thenDo(
		(): Promise<Awaited<ReturnType<IMapshotRpc["render"]>>> => {
			entered.resolve();
			return new Promise(() => undefined);
		},
	);
	const execution = import("./probe-mapshot-sdk");
	await entered.promise;
	await vi.advanceTimersByTimeAsync(120_000);
	await execution;
	expect(td.explain(_proxy.dispose).calls.map((call) => call.args)).toEqual([[]]);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});

it("cancels a streamed image when the deployment probe times out during delivery", async () => {
	const entered = Promise.withResolvers<void>();
	const cancel = td.func<(reason: unknown) => void>();
	const bytes = new ReadableStream<Uint8Array>(
		{
			pull(): void {
				entered.resolve();
			},
			cancel: cancel,
		},
		{ highWaterMark: 0 },
	);
	td.when(_mapshot.render(td.matchers.anything()), { times: 1 }).thenResolve({ ..._output, bytes: bytes });
	const execution = import("./probe-mapshot-sdk");
	await entered.promise;
	await vi.advanceTimersByTimeAsync(120_000);
	await execution;
	expect(td.explain(cancel).callCount).toBe(1);
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});

it("cancels an image stream returned after the deployment probe has timed out", async () => {
	const entered = Promise.withResolvers<void>();
	const result = Promise.withResolvers<typeof _output>();
	const cancel = td.func<(reason: unknown) => void>();
	const bytes = new ReadableStream<Uint8Array>({ cancel: cancel });
	td.when(_mapshot.render(td.matchers.anything()), { times: 1 }).thenDo((): Promise<typeof _output> => {
		entered.resolve();
		return result.promise;
	});
	const execution = import("./probe-mapshot-sdk");
	await entered.promise;
	await vi.advanceTimersByTimeAsync(120_000);
	await execution;
	result.resolve({ ..._output, bytes: bytes });
	await vi.waitFor(() => expect(td.explain(cancel).callCount).toBe(1));
	expect(td.explain(_writeFile).callCount).toBe(0);
	expect(process.exitCode).toBe(1);
});
