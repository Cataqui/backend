import "reflect-metadata";
import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import * as td from "testdouble";
import { container } from "tsyringe";
import { afterEach, expect, it, vi } from "vitest";
import { createDeploymentCandidate } from "../../test/basemap-deployment.fixture";
import { LandmarkIndexService } from "../landmark/landmark-index.service";
import { MapSourceService } from "./map-source.service";
import { TileIndexService } from "../tiles/tile-index.service";

afterEach(() => td.reset());
const _services: MapSourceService[] = [];
afterEach(async () => {
	await Promise.allSettled(_services.splice(0).map((service) => service.close()));
});

function _deferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(reason: unknown): void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise: promise, resolve: resolve, reject: reject };
}

function _fixture(): {
	service: MapSourceService;
	tiles: TileIndexService;
	landmarks: LandmarkIndexService;
	openTileIndex: typeof TileIndexService.open;
	openLandmarkIndex: typeof LandmarkIndexService.open;
	source: Awaited<ReturnType<TileIndexService["readSource"]>>;
} {
	const source = createDeploymentCandidate().release;
	const tiles = Object.assign(td.object<TileIndexService>(), {
		identity: { archiveId: "b".repeat(64), sha256: "d".repeat(64) },
		landmarkIndex: {
			path: "/qualified/indexes/landmarks.pmtiles",
			reference: {
				key: "source/import/attempts/fixture/attempt/references/landmarks.pmtiles",
				sha256: "c".repeat(64),
				bytes: 127,
				archiveId: "b".repeat(64),
			},
		} satisfies TileIndexService["landmarkIndex"],
	});
	const landmarks = td.object<LandmarkIndexService>();
	const openTileIndex = td.replace(TileIndexService, "open");
	const openLandmarkIndex = td.replace(LandmarkIndexService, "open");
	td.when(openTileIndex(td.matchers.anything())).thenResolve(tiles);
	td.when(openLandmarkIndex(td.matchers.anything())).thenResolve(landmarks);
	td.when(tiles.readSource()).thenResolve(source);
	td.when(tiles.close()).thenResolve(undefined);
	td.when(landmarks.close()).thenResolve(undefined);
	const service = new MapSourceService();
	_services.push(service);
	return {
		service: service,
		tiles: tiles,
		landmarks: landmarks,
		openTileIndex: openTileIndex,
		openLandmarkIndex: openLandmarkIndex,
		source: source,
	};
}

it("resolves without starting resource I/O and opens local indexes without a Worker connection", async () => {
	const fixture = _fixture();
	const dependencies = container.createChildContainer();
	const service = dependencies.resolve(MapSourceService);
	_services.push(service);
	expect(fixture.service.indexes).toBeUndefined();
	expect(td.explain(fixture.openTileIndex).callCount).toBe(0);
	await service.initialize();
	expect(td.explain(fixture.openTileIndex).calls[0]?.args[0]).toEqual({ worker: undefined });
	expect(td.explain(fixture.openLandmarkIndex).calls[0]?.args[0]).toEqual({
		path: fixture.tiles.landmarkIndex.path,
		reference: fixture.tiles.landmarkIndex.reference,
	});
	expect(service.indexes).toBe(fixture.tiles.identity);
});

it("shares startup across repeated initialization and preserves the first Worker connection", async () => {
	const fixture = _fixture();
	const worker = td.object<MapshotWorkerPortal>();
	const pending = fixture.service.initialize({ worker: worker });
	expect(fixture.service.initialize()).toBe(pending);
	await pending;
	expect(td.explain(fixture.openTileIndex).callCount).toBe(1);
	expect(td.explain(fixture.openTileIndex).calls[0]?.args[0]?.worker).toBe(worker);
	expect(fixture.service.initialize()).toBe(pending);
});

it("preloads the immutable source before publishing the index identity", async () => {
	const fixture = _fixture();
	const source = _deferred<typeof fixture.source>();
	td.when(fixture.tiles.readSource()).thenReturn(source.promise);
	const pending = fixture.service.initialize();
	await vi.waitFor(() => expect(td.explain(fixture.tiles.readSource).callCount).toBe(1));
	expect(fixture.service.indexes).toBeUndefined();
	source.resolve(fixture.source);
	await pending;
	expect(await fixture.service.readSource()).toBe(fixture.source);
	expect(await fixture.service.readSource()).toBe(fixture.source);
	expect(td.explain(fixture.tiles.readSource).callCount).toBe(3);
	expect(fixture.service.indexes).toBe(fixture.tiles.identity);
});

it("waits for one pending activation before serving source, resource, and landmark requests", async () => {
	const fixture = _fixture();
	const tiles = _deferred<TileIndexService>();
	td.when(fixture.openTileIndex(td.matchers.anything())).thenReturn(tiles.promise);
	const signal = new AbortController().signal;
	const read = { path: "/tiles/archive/13/1/1.mvt", signal: signal };
	const query = {
		center: { latitude: -23.55, longitude: -46.63 },
		zoom: 13,
		size: { width: 480, height: 480 },
		signal: signal,
	};
	const resource = {
		bytes: Uint8Array.of(1, 2, 3),
		revision: {
			id: "e".repeat(64),
			path: read.path,
		},
	} satisfies Awaited<ReturnType<TileIndexService["readResource"]>>;
	const landmarks = [] satisfies Awaited<ReturnType<LandmarkIndexService["query"]>>;
	td.when(fixture.tiles.readResource(read)).thenResolve(resource);
	td.when(fixture.landmarks.query(query)).thenResolve(landmarks);
	const initialized = fixture.service.initialize();
	const source = fixture.service.readSource();
	const reading = fixture.service.readResource(read);
	const querying = fixture.service.queryLandmarks(query);
	await Promise.resolve();
	expect(td.explain(fixture.openTileIndex).callCount).toBe(1);
	expect(td.explain(fixture.openLandmarkIndex).callCount).toBe(0);
	expect(td.explain(fixture.tiles.readResource).callCount).toBe(0);
	expect(td.explain(fixture.landmarks.query).callCount).toBe(0);
	tiles.resolve(fixture.tiles);
	await initialized;
	expect(await source).toBe(fixture.source);
	expect(await reading).toBe(resource);
	expect(await querying).toBe(landmarks);
	expect(td.explain(fixture.tiles.readResource).calls[0]?.args[0]?.signal).toBe(signal);
	expect(td.explain(fixture.landmarks.query).calls[0]?.args[0]?.signal).toBe(signal);
});

it("preserves resource and landmark failures without changing the owned provider errors", async () => {
	const fixture = _fixture();
	const failure = new Error("owned resource failure");
	td.when(fixture.tiles.readResource(td.matchers.anything())).thenReject(failure);
	td.when(fixture.landmarks.query(td.matchers.anything())).thenReject(failure);
	await fixture.service.initialize();
	await expect(fixture.service.readResource({ path: "/tiles/archive/13/1/1.mvt" })).rejects.toBe(failure);
	await expect(
		fixture.service.queryLandmarks({
			center: { latitude: -23.55, longitude: -46.63 },
			zoom: 13,
			size: { width: 480, height: 480 },
		}),
	).rejects.toBe(failure);
});

it.each(["tiles", "landmarks", "source"] as const)(
	"releases acquired handles once when %s activation fails",
	async (stage) => {
		const fixture = _fixture();
		const failure = new Error("basemap activation failed");
		if (stage === "tiles") td.when(fixture.openTileIndex(td.matchers.anything())).thenReject(failure);
		if (stage === "landmarks") td.when(fixture.openLandmarkIndex(td.matchers.anything())).thenReject(failure);
		if (stage === "source") td.when(fixture.tiles.readSource()).thenReject(failure);
		const pending = fixture.service.initialize();
		await expect(pending).rejects.toBe(failure);
		expect(fixture.service.indexes).toBeUndefined();
		expect(fixture.service.initialize()).toBe(pending);
		await expect(fixture.service.readSource()).rejects.toBe(failure);
		await fixture.service.close();
		expect(td.explain(fixture.tiles.close).callCount).toBe(stage === "tiles" ? 0 : 1);
		expect(td.explain(fixture.landmarks.close).callCount).toBe(stage === "source" ? 1 : 0);
	},
);

it("retains startup and both cleanup failures while releasing every acquired handle", async () => {
	const fixture = _fixture();
	const activationFailure = new Error("source activation failed");
	const landmarkFailure = new Error("landmark cleanup failed");
	const tileFailure = new Error("tile cleanup failed");
	td.when(fixture.tiles.readSource()).thenReject(activationFailure);
	td.when(fixture.landmarks.close()).thenReject(landmarkFailure);
	td.when(fixture.tiles.close()).thenReject(tileFailure);
	await expect(fixture.service.initialize()).rejects.toMatchObject({
		name: "SuppressedError",
		error: { name: "SuppressedError", error: tileFailure, suppressed: landmarkFailure },
		suppressed: activationFailure,
	});
	await fixture.service.close();
	expect(td.explain(fixture.tiles.close).callCount).toBe(1);
	expect(td.explain(fixture.landmarks.close).callCount).toBe(1);
});

it("waits for pending activation and closes late resources when shutdown begins", async () => {
	const fixture = _fixture();
	const tiles = _deferred<TileIndexService>();
	td.when(fixture.openTileIndex(td.matchers.anything())).thenReturn(tiles.promise);
	const pending = fixture.service.initialize();
	const reading = fixture.service.readSource();
	const rejectedRead = expect(reading).rejects.toMatchObject({ errorCode: "RESOURCE_UNAVAILABLE" });
	const closing = fixture.service.close();
	expect(fixture.service.close()).toBe(closing);
	expect(fixture.service.indexes).toBeUndefined();
	expect(td.explain(fixture.tiles.close).callCount).toBe(0);
	tiles.resolve(fixture.tiles);
	await pending;
	await rejectedRead;
	await closing;
	expect(fixture.service.indexes).toBeUndefined();
	expect(td.explain(fixture.tiles.close).callCount).toBe(1);
	expect(td.explain(fixture.landmarks.close).callCount).toBe(1);
});

it("waits for failed pending activation cleanup before completing shutdown", async () => {
	const fixture = _fixture();
	const source = _deferred<typeof fixture.source>();
	td.when(fixture.tiles.readSource()).thenReturn(source.promise);
	const pending = fixture.service.initialize();
	const failed = expect(pending).rejects.toThrow("source activation failed");
	await vi.waitFor(() => expect(td.explain(fixture.tiles.readSource).callCount).toBe(1));
	const closing = fixture.service.close();
	source.reject(new Error("source activation failed"));
	await failed;
	await closing;
	expect(td.explain(fixture.tiles.close).callCount).toBe(1);
	expect(td.explain(fixture.landmarks.close).callCount).toBe(1);
});

it("closes landmarks before tiles and shares cleanup across repeated shutdown calls", async () => {
	const fixture = _fixture();
	const drained = _deferred<void>();
	td.when(fixture.landmarks.close()).thenReturn(drained.promise);
	await fixture.service.initialize();
	const closing = fixture.service.close();
	expect(fixture.service.close()).toBe(closing);
	await vi.waitFor(() => expect(td.explain(fixture.landmarks.close).callCount).toBe(1));
	expect(td.explain(fixture.tiles.close).callCount).toBe(0);
	drained.resolve(undefined);
	await closing;
	expect(fixture.service.close()).toBe(closing);
	expect(td.explain(fixture.tiles.close).callCount).toBe(1);
	expect(td.explain(fixture.landmarks.close).callCount).toBe(1);
});

it("preserves both shutdown failures while still closing the tile index", async () => {
	const fixture = _fixture();
	const landmarkFailure = new Error("landmark cleanup failed");
	const tileFailure = new Error("tile cleanup failed");
	td.when(fixture.landmarks.close()).thenReject(landmarkFailure);
	td.when(fixture.tiles.close()).thenReject(tileFailure);
	await fixture.service.initialize();
	await expect(fixture.service.close()).rejects.toMatchObject({
		name: "SuppressedError",
		error: tileFailure,
		suppressed: landmarkFailure,
	});
	expect(td.explain(fixture.tiles.close).callCount).toBe(1);
	expect(td.explain(fixture.landmarks.close).callCount).toBe(1);
});

it("rejects new work after shutdown without activating unopened indexes", async () => {
	const fixture = _fixture();
	await expect(fixture.service.readSource()).rejects.toMatchObject({ errorCode: "RESOURCE_UNAVAILABLE" });
	await fixture.service.close();
	await expect(fixture.service.initialize()).rejects.toMatchObject({ errorCode: "RESOURCE_UNAVAILABLE" });
	await expect(fixture.service.readSource()).rejects.toMatchObject({ errorCode: "RESOURCE_UNAVAILABLE" });
	expect(td.explain(fixture.openTileIndex).callCount).toBe(0);
});
