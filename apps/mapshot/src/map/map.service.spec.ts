import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { PlaceCategory } from "@cataqui/places";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LandmarkService } from "../landmark/landmark.service";
import type { LandmarkOutput } from "../landmark/schemas/landmark-output.schema";
import type { RenderedImage } from "../renderer/rendered-image.interface";
import type { RendererService } from "../renderer/renderer.service";
import type { MapTile } from "../tiles/map-tile.interface";
import type { TileService } from "../tiles/tile.service";
import { MapService } from "./map.service";

afterEach(() => td.reset());
afterEach(() => vi.useRealTimers());

function _input(): MapshotRenderInput {
	return { center: { latitude: -23.5505, longitude: -46.6333 }, zoom: 13, size: { width: 480, height: 480 } };
}

function _image(): RenderedImage {
	return {
		bytes: Uint8Array.of(1, 2, 3),
		metadata: { contentType: "image/webp", digest: "a".repeat(64), pixelWidth: 960, pixelHeight: 960 },
	};
}

function _deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise: promise, resolve: resolve };
}

function _setup(): {
	service: MapService;
	tiles: TileService;
	landmarks: LandmarkService;
	renderer: RendererService;
	loadedTiles: MapTile[];
	foundLandmarks: LandmarkOutput[];
	image: RenderedImage;
} {
	const tiles = td.object<TileService>();
	const landmarks = td.object<LandmarkService>();
	const renderer = td.object<RendererService>();
	const loadedTiles = [
		{ key: "tile:revision", address: { z: 13, x: 4096, y: 4096 }, worldOffset: 0, bytes: Uint8Array.of(1) },
	] satisfies MapTile[];
	const foundLandmarks = [
		{
			id: "park",
			label: "Parque",
			alternativeLabels: [],
			category: PlaceCategory.PARK,
			coordinates: _input().center,
			sourceMinZoom: null,
			rank: 0,
		},
	] satisfies LandmarkOutput[];
	const image = _image();
	td.when(tiles.loadForRender(td.matchers.anything())).thenResolve(loadedTiles);
	td.when(landmarks.findForRender(td.matchers.anything())).thenResolve(foundLandmarks);
	td.when(renderer.render(td.matchers.anything())).thenResolve(image);
	return {
		service: new MapService(tiles, landmarks, renderer),
		tiles: tiles,
		landmarks: landmarks,
		renderer: renderer,
		loadedTiles: loadedTiles,
		foundLandmarks: foundLandmarks,
		image: image,
	};
}

describe("MapService", () => {
	it("starts only one tile-loading operation for each render", async () => {
		const setup = _setup();
		await setup.service.render({ input: _input() });
		td.verify(setup.tiles.loadForRender(td.matchers.anything()), { times: 1 });
	});

	it("passes the loaded map parts directly to the renderer and returns its image", async () => {
		const setup = _setup();
		const input = _input();
		expect(await setup.service.render({ input: input })).toBe(setup.image);
		const signal = td.explain(setup.tiles.loadForRender).calls[0]?.args[0].signal;
		td.verify(setup.landmarks.findForRender({ input: input, signal: signal }), { times: 1 });
		td.verify(
			setup.renderer.render({
				input: input,
				tiles: setup.loadedTiles,
				landmarks: setup.foundLandmarks,
				signal: signal,
			}),
			{ times: 1 },
		);
	});

	it("loads tiles and landmarks concurrently", async () => {
		const setup = _setup();
		const tiles = _deferred<MapTile[]>();
		const landmarks = _deferred<LandmarkOutput[]>();
		td.when(setup.tiles.loadForRender(td.matchers.anything())).thenReturn(tiles.promise);
		td.when(setup.landmarks.findForRender(td.matchers.anything())).thenReturn(landmarks.promise);
		const rendering = setup.service.render({ input: _input() });
		await vi.waitFor(() => {
			expect(td.explain(setup.tiles.loadForRender).callCount).toBe(1);
			expect(td.explain(setup.landmarks.findForRender).callCount).toBe(1);
		});
		td.verify(setup.renderer.render(td.matchers.anything()), { times: 0 });
		tiles.resolve(setup.loadedTiles);
		landmarks.resolve(setup.foundLandmarks);
		await rendering;
	});

	it.each([
		{ zoom: -1, size: { width: 6000, height: 1 } },
		{ zoom: 7.5, size: { width: 1, height: 6000 } },
		{ zoom: 25, size: { width: 3000, height: 2000 } },
	])("passes caller-selected camera values to every contributor: %o", async ({ zoom, size }) => {
		const setup = _setup();
		const input = { center: _input().center, zoom: zoom, size: size };
		await setup.service.render({ input: input });
		for (const dependency of [setup.tiles.loadForRender, setup.landmarks.findForRender, setup.renderer.render]) {
			expect(td.explain(dependency).calls[0]?.args[0].input).toEqual(input);
		}
	});

	it("rejects an already cancelled request before starting work", async () => {
		const setup = _setup();
		await expect(setup.service.render({ input: _input(), signal: AbortSignal.abort() })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		td.verify(setup.tiles.loadForRender(td.matchers.anything()), { times: 0 });
		td.verify(setup.landmarks.findForRender(td.matchers.anything()), { times: 0 });
	});

	it.each(["tiles", "landmarks"] as const)("cancels and drains the sibling when %s fail", async (failed) => {
		const setup = _setup();
		const failure = new Error("Source read failed");
		const pending = _deferred<never[]>();
		const failing = failed === "tiles" ? setup.tiles.loadForRender : setup.landmarks.findForRender;
		const sibling = failed === "tiles" ? setup.landmarks.findForRender : setup.tiles.loadForRender;
		td.when(failing(td.matchers.anything())).thenReject(failure);
		td.when(sibling(td.matchers.anything())).thenReturn(pending.promise);
		let settled = false;
		const rendering = setup.service.render({ input: _input() });
		const result = Promise.allSettled([rendering]).then((value) => {
			settled = true;
			return value;
		});
		await vi.waitFor(() => expect(td.explain(sibling).calls[0]?.args[0].signal.aborted).toBe(true));
		expect(settled).toBe(false);
		let closed = false;
		const closing = setup.service.close().then(() => {
			closed = true;
		});
		await Promise.resolve();
		expect(closed).toBe(false);
		pending.resolve([]);
		expect(await result).toEqual([{ status: "rejected", reason: failure }]);
		await closing;
		td.verify(setup.renderer.render(td.matchers.anything()), { times: 0 });
	});

	it("does not render source results completed after caller cancellation", async () => {
		const setup = _setup();
		const pending = _deferred<MapTile[]>();
		td.when(setup.tiles.loadForRender(td.matchers.anything())).thenReturn(pending.promise);
		const controller = new AbortController();
		const rendering = setup.service.render({ input: _input(), signal: controller.signal });
		const rejected = expect(rendering).rejects.toMatchObject({ errorCode: "ABORTED" });
		await vi.waitFor(() => expect(td.explain(setup.tiles.loadForRender).callCount).toBe(1));
		controller.abort();
		expect(td.explain(setup.tiles.loadForRender).calls[0]?.args[0].signal.aborted).toBe(true);
		pending.resolve([]);
		await rejected;
		td.verify(setup.renderer.render(td.matchers.anything()), { times: 0 });
	});

	it("does not return an image completed after caller cancellation", async () => {
		const setup = _setup();
		const controller = new AbortController();
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenDo(async (): Promise<RenderedImage> => {
			controller.abort();
			return _image();
		});
		await expect(setup.service.render({ input: _input(), signal: controller.signal })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		await expect(setup.service.render({ input: _input() })).resolves.toHaveProperty("metadata");
	});

	it("releases the queue after a source or renderer failure", async () => {
		const setup = _setup();
		const sourceFailure = new Error("Tiles unavailable");
		td.when(setup.tiles.loadForRender(td.matchers.anything()), { times: 1 }).thenReject(sourceFailure);
		await expect(setup.service.render({ input: _input() })).rejects.toBe(sourceFailure);
		const renderFailure = new Error("Renderer unavailable");
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenReject(renderFailure);
		await expect(setup.service.render({ input: _input() })).rejects.toBe(renderFailure);
		await expect(setup.service.render({ input: _input() })).resolves.toBe(setup.image);
	});

	it("serializes more than eight queued renders without rejecting requests", async () => {
		const setup = _setup();
		const pending = _deferred<RenderedImage>();
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenReturn(pending.promise);
		const renders = Array.from({ length: 13 }, () => setup.service.render({ input: _input() }));
		const completed = Promise.all(renders);
		await vi.waitFor(() => expect(td.explain(setup.renderer.render).callCount).toBe(1));
		expect(td.explain(setup.tiles.loadForRender).callCount).toBe(1);
		pending.resolve(_image());
		expect(await completed).toHaveLength(13);
		td.verify(setup.renderer.render(td.matchers.anything()), { times: 13 });
	});

	it("skips queued work whose caller cancelled while another render was active", async () => {
		const setup = _setup();
		const pending = _deferred<RenderedImage>();
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenReturn(pending.promise);
		const first = setup.service.render({ input: _input() });
		const controller = new AbortController();
		const queued = setup.service.render({ input: _input(), signal: controller.signal });
		const rejected = expect(queued).rejects.toMatchObject({ errorCode: "ABORTED" });
		controller.abort();
		await vi.waitFor(() => expect(td.explain(setup.renderer.render).callCount).toBe(1));
		pending.resolve(_image());
		await first;
		await rejected;
		td.verify(setup.tiles.loadForRender(td.matchers.anything()), { times: 1 });
	});

	it("lets callers own deadlines during rendering and queue waiting", async () => {
		vi.useFakeTimers();
		const setup = _setup();
		const pending = _deferred<RenderedImage>();
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenReturn(pending.promise);
		const first = setup.service.render({ input: _input() });
		const queued = setup.service.render({ input: _input() });
		const completed = Promise.all([first, queued]);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(td.explain(setup.renderer.render).callCount).toBe(1);
		expect(td.explain(setup.renderer.render).calls[0]?.args[0].signal.aborted).toBe(false);
		pending.resolve(_image());
		expect(await completed).toHaveLength(2);
	});

	it("drains active and queued work on close and refuses new renders", async () => {
		const setup = _setup();
		const pending = _deferred<RenderedImage>();
		td.when(setup.renderer.render(td.matchers.anything()), { times: 1 }).thenReturn(pending.promise);
		const renders = [setup.service.render({ input: _input() }), setup.service.render({ input: _input() })];
		await vi.waitFor(() => expect(td.explain(setup.renderer.render).callCount).toBe(1));
		const closing = setup.service.close();
		expect(setup.service.close()).toBe(closing);
		await expect(setup.service.render({ input: _input() })).rejects.toMatchObject({ errorCode: "CLOSED" });
		pending.resolve(_image());
		await Promise.all([...renders, closing]);
		td.verify(setup.renderer.render(td.matchers.anything()), { times: 2 });
		td.verify(setup.renderer.close(), { times: 0 });
	});
});
