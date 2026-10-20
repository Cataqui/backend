import { InvalidRendererFrameError } from "./errors/invalid-renderer-frame.error";
import { RendererProcessClosedError } from "./errors/renderer-process-closed.error";
import { RendererProcessUnavailableError } from "./errors/renderer-process-unavailable.error";
import { AppErrorCode, RenderingAbortedError } from "../errors/index";
import { LandmarkCategories } from "../landmark/landmark-categories";
import { PlaceCategoryStyle } from "@cataqui/places/style";
import { createHash } from "node:crypto";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { PlaceCategory } from "@cataqui/places";
import type { LandmarkOutput } from "../landmark/schemas/landmark-output.schema";
import type { MapTile } from "../tiles/map-tile.interface";
import type { EngineAssetsService } from "./engine-assets.service";
import type { AsyncQueue } from "@cataqui/async";
import * as td from "testdouble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineMapRenderInput } from "./engine-map-render-input.interface";
import type { EngineRenderOutput } from "./schemas/engine-render-output.schema";
import type { RendererProcessRepository, RendererProcessResponse } from "./renderer-process.repository";
import { RendererService } from "./renderer.service";

afterEach(() => td.reset());

const _fixtures = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { createQueue: td.func<() => AsyncQueue>(), queues: [] as AsyncQueue[] };
});
vi.mock("@cataqui/async", () => ({
	AsyncQueue: function _AsyncQueue(): AsyncQueue {
		return _fixtures.createQueue();
	},
}));

const _image = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
const _render = {
	width: 16,
	height: 16,
	bytes: Buffer.from(_image, "base64").length,
	imageBase64: _image,
	metrics: { renderMs: 1, encodeMs: 2, acceptedLabelIds: ["landmark:park"], missingGlyphs: 0, unsupportedLabels: 0 },
} satisfies EngineRenderOutput;
const _input = {
	center: { latitude: 0, longitude: 0 },
	zoom: 13,
	size: { width: 8, height: 8 },
} satisfies MapshotRenderInput;
const _map = {
	camera: { latitude: 0, longitude: 0, zoom: 13, width: 8, height: 8, pixelRatio: 2 },
	tiles: [],
	landmarks: {
		candidates: [],
		style: {
			badgeRadius: 8,
			badgeStrokeWidth: 1.25,
			labelGap: 3,
			edgeMargin: 6,
			labelFontSize: 8,
			labelMaxWidth: 80,
			labelMaxLines: 3,
			labelLineHeight: 10,
			labelLetterSpacing: -0.2,
			labelHaloWidth: 2,
		},
	},
} satisfies EngineMapRenderInput;

beforeEach(() => {
	_fixtures.queues.length = 0;
	td.when(_fixtures.createQueue()).thenDo((): AsyncQueue => {
		const queue = td.object<AsyncQueue>();
		td.when(queue.enqueue(td.matchers.isA(Function))).thenDo(
			async <T>(operation: () => T | PromiseLike<T>): Promise<T> => operation(),
		);
		td.when(queue.wait()).thenResolve(undefined);
		_fixtures.queues.push(queue);
		return queue;
	});
});

function _service(params: { running?: boolean } = {}): {
	service: RendererService;
	repository: RendererProcessRepository;
	state: { running: boolean };
} {
	const repository = td.object<RendererProcessRepository>();
	const state = { running: params.running ?? false };
	Object.defineProperty(repository, "running", { get: (): boolean => state.running });
	td.when(repository.start()).thenDo(async (): Promise<void> => {
		state.running = true;
	});
	td.when(repository.kill()).thenDo(async (): Promise<void> => {
		state.running = false;
	});
	td.when(repository.close()).thenDo(async (): Promise<void> => {
		state.running = false;
	});

	td.when(repository.request(td.matchers.contains({ operation: { op: "ready" } }))).thenResolve(
		_reply({ id: 1, ok: true, ..._render }),
	);
	td.when(repository.request(td.matchers.contains({ operation: { op: "render" } }))).thenResolve(
		_reply({ id: 1, ok: true, ..._render }),
	);
	return {
		service: new RendererService(
			repository,
			Object.assign(td.object<EngineAssetsService>(), {
				badges: new Map(
					Array.from(LandmarkCategories, (category) => [
						category,
						{ path: `/assets/${category}.png`, logicalSize: 26 },
					]),
				),
			}),
		),
		repository: repository,
		state: state,
	};
}

function _reply(value: unknown): RendererProcessResponse {
	return { id: 1, value: value };
}

async function _nativeMap(
	params: { input?: MapshotRenderInput; tiles?: MapTile[]; landmarks?: LandmarkOutput[] } = {},
): Promise<EngineMapRenderInput> {
	const { service, repository } = _service({ running: true });
	const input = params.input ?? _input;
	td.when(repository.request(td.matchers.anything())).thenResolve(
		_reply({ id: 1, ok: true, ..._render, width: input.size.width * 2, height: input.size.height * 2 }),
	);
	await service.render({
		input: input,
		tiles: params.tiles ?? [],
		landmarks: params.landmarks ?? [],
		signal: new AbortController().signal,
	});
	const operation = td.explain(repository.request).calls.at(-1)?.args[0].operation;
	if (operation?.op !== "render") throw new Error("Renderer did not submit a render operation.");
	return operation.map;
}

describe("RendererService", () => {
	it("reuses the ready process across repeated starts and renders", async () => {
		const { service, repository } = _service();
		const signal = AbortSignal.timeout(2000);
		await service.start({ signal: signal });
		await service.start({ signal: signal });
		const result = await service.render({ input: _input, tiles: [], landmarks: [], signal: signal });
		expect(Buffer.from(result.bytes).toString("base64")).toBe(_image);
		expect(result).toMatchObject({
			metadata: {
				pixelWidth: 16,
				pixelHeight: 16,
				contentType: "image/webp",
				digest: createHash("sha256").update(Buffer.from(_image, "base64")).digest("hex"),
			},
			diagnostics: _render.metrics,
		});
		expect(td.explain(repository.start).callCount).toBe(1);
		expect(td.explain(repository.request).calls.map(({ args }) => args)).toEqual([
			[{ operation: { op: "ready" }, signal: signal }],
			[{ operation: { op: "render", map: _map }, signal: signal }],
		]);
		expect(td.explain(_fixtures.createQueue).calls.map(({ args }) => args)).toEqual([[]]);
		td.verify(_fixtures.queues[0]!.enqueue(td.matchers.isA(Function)), { times: 3 });
	});

	it("qualifies and warms a cold process before rendering without an explicit start", async () => {
		const { service, repository } = _service();
		const signal = AbortSignal.timeout(2000);
		await service.render({ input: _input, tiles: [], landmarks: [], signal: signal });
		expect(td.explain(repository.request).calls.map(({ args }) => args)).toEqual([
			[{ operation: { op: "ready" }, signal: signal }],
			[{ operation: { op: "render", map: _map }, signal: signal }],
		]);
	});

	it("rejects a readiness response completed after cancellation without rendering", async () => {
		const { service, repository } = _service();
		const controller = new AbortController();
		td.when(repository.request(td.matchers.contains({ operation: { op: "ready" } }))).thenDo(
			async (): Promise<RendererProcessResponse> => {
				controller.abort();
				return _reply({ id: 1, ok: true, ..._render });
			},
		);
		await expect(
			service.render({ input: _input, tiles: [], landmarks: [], signal: controller.signal }),
		).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		expect(td.explain(repository.request).calls.map(({ args }) => args[0].operation.op)).toEqual(["ready"]);
		td.verify(repository.kill(), { times: 1 });
	});

	it("waits for failed readiness cleanup before rejecting a cold render and retries the next render", async () => {
		const { service, repository, state } = _service();
		const failure = new RenderingAbortedError();
		const stopping = Promise.withResolvers<void>();
		const stopped = Promise.withResolvers<void>();
		td.when(repository.request(td.matchers.contains({ operation: { op: "ready" } })), { times: 1 }).thenReject(failure);
		td.when(repository.kill()).thenDo(async (): Promise<void> => {
			stopping.resolve();
			await stopped.promise;
			state.running = false;
		});
		let settled = false;
		const pending = service
			.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) })
			.finally(() => {
				settled = true;
			});
		const rejected = expect(pending).rejects.toBe(failure);
		await stopping.promise;
		expect(settled).toBe(false);
		expect(td.explain(repository.request).calls.map(({ args }) => args[0].operation.op)).toEqual(["ready"]);
		stopped.resolve();
		await rejected;
		await service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) });
		expect(td.explain(repository.request).calls.map(({ args }) => args[0].operation.op)).toEqual([
			"ready",
			"ready",
			"render",
		]);
	});

	it("waits for queued work to drain before closing and rejects new submissions", async () => {
		const { service, repository } = _service();
		const drained = Promise.withResolvers<void>();
		td.when(_fixtures.queues[0]!.wait()).thenReturn(drained.promise);
		const closing = service.close();
		expect(td.explain(repository.close).callCount).toBe(0);
		await expect(service.start({ signal: AbortSignal.timeout(2000) })).rejects.toMatchObject({
			errorCode: "CLOSED",
		});
		expect(td.explain(_fixtures.queues[0]!.enqueue).callCount).toBe(0);
		drained.resolve();
		await closing;
		td.verify(repository.close(), { times: 1 });
	});

	it.each(["start", "render"] as const)(
		"does not start %s work cancelled before the queue executes",
		async (operation) => {
			const { service, repository } = _service();
			const execute = Promise.withResolvers<void>();
			td.when(_fixtures.queues[0]!.enqueue(td.matchers.anything())).thenDo(
				async <T>(operation: () => T | PromiseLike<T>): Promise<T> => {
					await execute.promise;
					return operation();
				},
			);
			const controller = new AbortController();
			const pending =
				operation === "start"
					? service.start({ signal: controller.signal })
					: service.render({ input: _input, tiles: [], landmarks: [], signal: controller.signal });
			const rejected = expect(pending).rejects.toMatchObject({ errorCode: "ABORTED" });
			controller.abort();
			execute.resolve();
			await rejected;
			expect(td.explain(repository.start).callCount).toBe(0);
			expect(td.explain(repository.request).callCount).toBe(0);
		},
	);

	it("rejects already cancelled operations before starting the process", async () => {
		const { service, repository } = _service();
		await expect(service.start({ signal: AbortSignal.abort() })).rejects.toMatchObject({ errorCode: "ABORTED" });
		expect(td.explain(repository.start).callCount).toBe(0);
	});

	it.each([
		{
			value: { ..._render, imageBase64: undefined },
			message: "Renderer image response does not match the render output contract.",
			code: AppErrorCode.RENDERER_IMAGE_OUTPUT_INVALID,
		},
		{
			value: { ..._render, metrics: { ..._render.metrics, missingGlyphs: 1 } },
			message: "Renderer image text coverage is invalid.",
			code: AppErrorCode.RENDERER_TEXT_COVERAGE_INVALID,
		},
		{
			value: { ..._render, metrics: { ..._render.metrics, unsupportedLabels: 1 } },
			message: "Renderer image text coverage is invalid.",
			code: AppErrorCode.RENDERER_TEXT_COVERAGE_INVALID,
		},
	])("validates renderer output before returning it: $message", async ({ value, message, code }) => {
		const { service, repository } = _service({ running: true });
		td.when(repository.request(td.matchers.anything())).thenResolve(_reply({ id: 1, ok: true, ...value }));
		await expect(
			service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			errorCode: code,
			message: message,
		});
		td.verify(repository.kill(), { times: 1 });
	});

	it("validates readiness dimensions in the service", async () => {
		const { service, repository } = _service();
		td.when(repository.request(td.matchers.contains({ operation: { op: "ready" } }))).thenResolve(
			_reply({ id: 1, ok: true, ..._render, width: 32 }),
		);
		await expect(service.start({ signal: AbortSignal.timeout(2000) })).rejects.toMatchObject({
			name: "RendererReadinessImageDimensionsError",
			message: "Renderer readiness image must be 16 by 16 pixels.",
		});
		td.verify(repository.kill(), { times: 1 });
	});

	it("returns an encoded image larger than the former 20 MB output cap", async () => {
		const { service, repository } = _service({ running: true });
		const output = {
			..._render,
			bytes: 20_000_003,
			imageBase64: Buffer.alloc(20_000_003).toString("base64"),
		} satisfies EngineRenderOutput;
		td.when(repository.request(td.matchers.anything())).thenDo(
			(): Promise<RendererProcessResponse> => Promise.resolve(_reply({ id: 1, ok: true, ...output })),
		);
		const result = await service.render({
			input: _input,
			tiles: [],
			landmarks: [],
			signal: new AbortController().signal,
		});
		expect(result.bytes.byteLength).toBe(20_000_003);
		expect(result.metadata.pixelWidth).toBe(output.width);
	});

	it.each([
		{ width: 32, height: 16 },
		{ width: 16, height: 32 },
	])(
		"rejects a renderer image whose $width x $height dimensions differ from the request",
		async ({ width, height }) => {
			const { service, repository } = _service({ running: true });
			td.when(repository.request(td.matchers.anything())).thenResolve(
				_reply({ id: 1, ok: true, ..._render, width: width, height: height }),
			);
			await expect(
				service.render({ input: _input, tiles: [], landmarks: [], signal: new AbortController().signal }),
			).rejects.toMatchObject({
				name: "RendererImageDimensionsMismatchError",
				message: "Renderer image dimensions do not match the requested representation.",
			});
			td.verify(repository.kill(), { times: 1 });
		},
	);

	it.each([
		{ value: null, name: "RendererResponseInvalidError", code: AppErrorCode.RENDERER_RESPONSE_INVALID },
		{
			value: { id: 2, ok: true },
			name: "RendererResponseIdMismatchError",
			code: AppErrorCode.RENDERER_RESPONSE_ID_MISMATCH,
		},
		{
			value: { id: 1, ok: false, error: "private diagnostic" },
			name: "RendererRejectedError",
			code: AppErrorCode.RENDERER_REJECTED,
		},
	])("interprets protocol responses and keeps diagnostics private: $name", async ({ value, name, code }) => {
		const { service, repository } = _service({ running: true });
		td.when(repository.request(td.matchers.anything())).thenResolve(_reply(value));
		const error = await service
			.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) })
			.catch((error: unknown) => error);
		expect(error).toMatchObject({ name: name, errorCode: code });
		if (error instanceof Error) expect(error.message).not.toContain("private diagnostic");
	});

	it.each([new InvalidRendererFrameError(), new RendererProcessClosedError(), new RendererProcessUnavailableError()])(
		"preserves renderer transport errors through cleanup: $name",
		async (error) => {
			const { service, repository } = _service({ running: true });
			td.when(repository.request(td.matchers.anything())).thenReject(error);
			await expect(
				service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) }),
			).rejects.toBe(error);
			td.verify(repository.kill(), { times: 1 });
		},
	);

	it.each([
		{ error: new SyntaxError("provider JSON"), code: AppErrorCode.RENDERER_RESPONSE_INVALID },
		{ error: new TypeError("provider UTF8"), code: AppErrorCode.RENDERER_RESPONSE_INVALID },
		{ error: new Error("provider failure"), code: AppErrorCode.RENDERER_RENDER_FAILED },
	])("translates decoding and unexpected failures into application errors: $error", async ({ error, code }) => {
		const { service, repository } = _service({ running: true });
		td.when(repository.request(td.matchers.anything())).thenReject(error);
		await expect(
			service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			errorCode: code,
		});
		td.verify(repository.kill(), { times: 1 });
	});

	it("waits for process cleanup before returning cancellation", async () => {
		const { service, repository } = _service({ running: true });
		const controller = new AbortController();
		const stopped = Promise.withResolvers<void>();
		td.when(repository.request(td.matchers.anything())).thenDo(async (): Promise<RendererProcessResponse> => {
			controller.abort();
			throw new Error("process closed");
		});
		td.when(repository.kill()).thenReturn(stopped.promise);
		let settled = false;
		const pending = service
			.render({ input: _input, tiles: [], landmarks: [], signal: controller.signal })
			.finally(() => {
				settled = true;
			});
		const rejected = expect(pending).rejects.toMatchObject({ errorCode: "ABORTED" });
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		stopped.resolve();
		await rejected;
	});

	it.each([false, true])(
		"rejects a response completed after cancellation when already running is %s",
		async (running) => {
			const { service, repository } = _service({ running: running });
			const controller = new AbortController();
			td.when(repository.request(td.matchers.anything())).thenDo(async (): Promise<RendererProcessResponse> => {
				controller.abort();
				return _reply({ id: 1, ok: true, ..._render });
			});
			await expect(
				service.render({ input: _input, tiles: [], landmarks: [], signal: controller.signal }),
			).rejects.toMatchObject({
				errorCode: "ABORTED",
			});
			td.verify(repository.kill(), { times: 1 });
		},
	);

	it("preserves meaningful owned errors", async () => {
		const { service, repository } = _service({ running: true });
		const error = new RenderingAbortedError();
		td.when(repository.request(td.matchers.anything())).thenReject(error);
		await expect(
			service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) }),
		).rejects.toBe(error);
	});

	it("warms a replacement process after invalid output", async () => {
		const { service, repository } = _service({ running: true });
		td.when(repository.request(td.matchers.anything()), { times: 1 }).thenResolve(_reply(null));
		await expect(
			service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			errorCode: AppErrorCode.RENDERER_RESPONSE_INVALID,
		});
		await service.render({ input: _input, tiles: [], landmarks: [], signal: AbortSignal.timeout(2000) });
		expect(td.explain(repository.request).calls.map(({ args }) => args[0].operation.op)).toEqual([
			"render",
			"ready",
			"render",
		]);
	});

	it("maps process startup failures in the service", async () => {
		const { service, repository, state } = _service();
		td.when(repository.start()).thenReject(new Error("private startup failure"));
		state.running = false;
		await expect(service.start({ signal: AbortSignal.timeout(2000) })).rejects.toMatchObject({
			name: "RendererInitializationFailedError",
		});
		td.verify(repository.kill(), { times: 1 });
	});
});

describe("RendererService native input", () => {
	it.each(Array.from(LandmarkCategories))("forwards the shared text color for %s", async (category) => {
		const map = await _nativeMap({
			landmarks: [
				{
					id: "colored",
					label: "Museum of Art",
					alternativeLabels: [],
					category: category,
					coordinates: _input.center,
					sourceMinZoom: null,
					rank: 0,
				},
			],
		});
		expect(map.landmarks.candidates[0]?.textColor).toBe(PlaceCategoryStyle[category].textColor);
	});

	it("preserves the caller camera and the current rendering defaults", async () => {
		const input = {
			center: { latitude: -23.55, longitude: -46.63 },
			zoom: 7.5,
			size: { width: 6000, height: 1 },
		} satisfies MapshotRenderInput;
		const map = await _nativeMap({ input: input });
		expect(map).toEqual({
			camera: { latitude: -23.55, longitude: -46.63, zoom: 7.5, width: 6000, height: 1, pixelRatio: 2 },
			tiles: [],
			landmarks: _map.landmarks,
		});
	});

	it("encodes exactly the supplied source bytes and preserves immutable tile keys and world copies", async () => {
		const bytes = Uint8Array.of(99, 0, 128, 255, 77).subarray(1, 4);
		const tiles = [-1, 0, 1].map((worldOffset) => ({
			key: "/tiles/source/0/0/0.mvt:sha256",
			address: { z: 0, x: 0, y: 0 },
			worldOffset: worldOffset,
			bytes: bytes,
		})) satisfies MapTile[];
		const map = await _nativeMap({ tiles: tiles });
		expect(map.tiles).toEqual(
			tiles.map((tile) => ({
				key: tile.key,
				address: { z: 0, x: 0, y: 0 },
				worldOffset: tile.worldOffset,
				bytes: "AID/",
			})),
		);
	});

	it("preserves all candidate coordinates, ranks and order for native projection and placement", async () => {
		const landmarks = Array.from({ length: 100 }, (_, index) => ({
			id: `${index}`,
			label: `Praça ${index}`,
			alternativeLabels: [],
			category: PlaceCategory.PARK,
			coordinates: { latitude: -23.55, longitude: -46.63 + index / 1000 },
			sourceMinZoom: index % 2 === 0 ? 13 : null,
			rank: 99 - index,
		})) satisfies LandmarkOutput[];
		const map = await _nativeMap({ landmarks: landmarks });
		expect(map.landmarks.candidates).toHaveLength(100);
		for (const [index, candidate] of map.landmarks.candidates.entries()) {
			const landmark = landmarks[index]!;
			expect(candidate).toMatchObject({
				id: `landmark:${landmark.id}`,
				labels: [{ text: landmark.label }],
				coordinates: landmark.coordinates,
				badge: { path: "/assets/PARK.png", logicalSize: 26 },
				textColor: PlaceCategoryStyle[landmark.category].textColor,
				rank: landmark.rank,
				sourceMinZoom: landmark.sourceMinZoom,
			});
		}
	});

	it.each([
		PlaceCategory.PARK,
		PlaceCategory.MUSEUM,
		PlaceCategory.HOSPITAL,
		PlaceCategory.EDUCATION,
		PlaceCategory.TRAIN_STATION,
		PlaceCategory.BUS_STATION,
		PlaceCategory.POLICE_STATION,
		PlaceCategory.FIRE_STATION,
		PlaceCategory.PHARMACY,
		PlaceCategory.OTHER,
	])("forwards source relevance independently of category %s", async (category) => {
		const map = await _nativeMap({
			landmarks: [
				{
					id: "reference",
					label: "Reference",
					alternativeLabels: [],
					category: category,
					coordinates: _input.center,
					rank: 0,
					sourceMinZoom: 15,
				},
			],
		});
		expect(map.landmarks.candidates[0]).toMatchObject({
			id: "landmark:reference",
			badge: { path: `/assets/${category}.png`, logicalSize: 26 },
			rank: 0,
			sourceMinZoom: 15,
		});
		expect(map.landmarks.candidates[0]).not.toHaveProperty("referenceWeight");
	});

	it.each([PlaceCategory.CAFE])("omits candidates whose category %s has no supported badge", async (category) => {
		const map = await _nativeMap({
			landmarks: [
				{
					id: "unsupported",
					label: "中央駅",
					alternativeLabels: [],
					category: category,
					coordinates: _input.center,
					sourceMinZoom: null,
					rank: 0,
				},
			],
		});
		expect(map.landmarks.candidates).toEqual([]);
	});

	it.each([
		{ width: 480, height: 480 },
		{ width: 480, height: 1280 },
	])("preserves placement defaults for $width x $height", async ({ width, height }) => {
		const map = await _nativeMap({
			input: { center: _input.center, zoom: _input.zoom, size: { width: width, height: height } },
		});
		expect(map.landmarks.style).toEqual(_map.landmarks.style);
		expect(map.landmarks).not.toHaveProperty("budget");
	});

	it("preserves primary and alternative names larger than the former wire byte limits", async () => {
		const names = ["a".repeat(16 * 1024 + 1), "é".repeat(16 * 1024 + 1)];
		const map = await _nativeMap({
			landmarks: [
				{
					id: "park",
					label: names[0]!,
					alternativeLabels: [names[1]!],
					category: PlaceCategory.PARK,
					coordinates: _input.center,
					sourceMinZoom: null,
					rank: 0,
				},
			],
		});
		expect(map.landmarks.candidates[0]!.labels.map((label) => label.text)).toEqual(names);
	});

	it("preserves genuine primary and alternative names in provider order", async () => {
		const map = await _nativeMap({
			landmarks: [
				{
					id: "park",
					label: "\u{10ffff}",
					alternativeLabels: ["東京 公園", "Parque"],
					category: PlaceCategory.PARK,
					coordinates: _input.center,
					sourceMinZoom: null,
					rank: 0,
				},
			],
		});
		expect(map.landmarks.candidates[0]!.labels.map((label) => label.text)).toEqual([
			"\u{10ffff}",
			"東京 公園",
			"Parque",
		]);
	});

	it.each(["中央 公園 سَلام a\u200db 서울", "กรุงเทพมหานคร พิพิธภัณฑสถานแห่งชาติ", "👨‍👩‍👧‍👦 Cafe\u0301 🏳️‍🌈", "", " "])(
		"preserves UTF-8 ICU word and grapheme boundaries for %s",
		async (text) => {
			const map = await _nativeMap({
				landmarks: [
					{
						id: "park",
						label: text,
						alternativeLabels: [],
						category: PlaceCategory.PARK,
						coordinates: _input.center,
						sourceMinZoom: null,
						rank: 0,
					},
				],
			});
			const label = map.landmarks.candidates[0]!.labels[0]!;
			expect(label.text).toBe(text);
			for (const [granularity, ends] of [
				["word", label.wordEnds],
				["grapheme", label.graphemeEnds],
			] as const) {
				const bytes = Buffer.from(text);
				let offset = 0;
				const segments = ends.map((end) => {
					expect(Number.isInteger(end)).toBe(true);
					expect(end).toBeGreaterThan(offset);
					expect(end).toBeLessThanOrEqual(bytes.length);
					expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, end))).not.toThrow();
					const segment = bytes.subarray(offset, end).toString("utf8");
					offset = end;
					return segment;
				});
				expect(segments).toEqual(
					[...new Intl.Segmenter(undefined, { granularity: granularity }).segment(text)].map((part) => part.segment),
				);
				expect(offset).toBe(bytes.length);
			}
		},
	);
});
