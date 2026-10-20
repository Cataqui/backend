import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { setImmediate } from "node:timers/promises";
import * as td from "testdouble";
import { afterEach, describe, expect, it } from "vitest";
import { MapshotApplication } from "./application";
import type { MapService } from "./map/map.service";
import type { RendererService } from "./renderer/renderer.service";
import type { MapSourceService } from "./source/map-source.service";
import type { TileResourceService } from "./tiles/tile-resource.service";

afterEach(() => td.reset());

function _deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise: promise, resolve: resolve, reject: reject };
}

function _setup(): {
	application: MapshotApplication;
	mapService: MapService;
	rendererService: RendererService;
	mapSourceService: MapSourceService;
	tileResources: TileResourceService;
	events: string[];
} {
	const events: string[] = [];
	const mapService = td.object<MapService>();
	const rendererService = td.object<RendererService>();
	const mapSourceService = td.object<MapSourceService>();
	Object.defineProperty(mapSourceService, "indexes", {
		value: { archiveId: "prepared-archive", sha256: "a".repeat(64) } satisfies MapSourceService["indexes"],
	});
	const tileResources = td.object<TileResourceService>();
	td.when(mapSourceService.initialize(td.matchers.anything())).thenResolve(undefined);
	td.when(rendererService.start(td.matchers.anything())).thenResolve(undefined);
	td.when(mapService.close()).thenDo(async (): Promise<void> => {
		events.push("map");
	});
	td.when(rendererService.close()).thenDo(async (): Promise<void> => {
		events.push("renderer");
	});
	td.when(tileResources.close()).thenDo(async (): Promise<void> => {
		events.push("tileResources");
	});
	td.when(mapSourceService.close()).thenDo(async (): Promise<void> => {
		events.push("mapSourceService");
	});
	return {
		application: new MapshotApplication(mapService, mapSourceService, tileResources, rendererService),
		mapService: mapService,
		rendererService: rendererService,
		mapSourceService: mapSourceService,
		tileResources: tileResources,
		events: events,
	};
}

describe("MapshotApplication", () => {
	it("keeps construction free of startup work", () => {
		const setup = _setup();
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		expect(setup.application.signal.aborted).toBe(false);
		expect(td.explain(setup.mapSourceService.initialize).callCount).toBe(0);
		expect(td.explain(setup.rendererService.start).callCount).toBe(0);
	});

	it("passes the Worker client directly to map source activation", async () => {
		const setup = _setup();
		const worker = td.object<MapshotWorkerPortal>();
		await setup.application.initialize({ worker: worker });
		const [activation] = td.explain(setup.mapSourceService.initialize).calls;
		expect(activation?.args[0].worker).toBe(worker);
		expect(setup.application.ready).toBe(true);
		expect(setup.application.indexes).toBe(setup.mapSourceService.indexes);
		await setup.application.close();
	});

	it("gives engine startup a thirty-second deadline and forwards its cancellation", async () => {
		const setup = _setup();
		const deadline = new AbortController();
		const timeout = td.replace(AbortSignal, "timeout");
		td.when(timeout(30_000)).thenReturn(deadline.signal);
		await setup.application.initialize();
		const signal = td.explain(setup.rendererService.start).calls[0]?.args[0].signal;
		expect(td.explain(timeout).calls.map(({ args }) => args)).toEqual([[30_000]]);
		expect(signal?.aborted).toBe(false);
		deadline.abort();
		expect(signal?.aborted).toBe(true);
		await setup.application.close();
	});

	it("qualifies the renderer while map source activation is pending", async () => {
		const setup = _setup();
		const activation = _deferred<void>();
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReturn(activation.promise);
		const initializing = setup.application.initialize();
		await setImmediate();
		expect(td.explain(setup.rendererService.start).callCount).toBe(1);
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		activation.resolve(undefined);
		await initializing;
		expect(setup.application.ready).toBe(true);
		await setup.application.close();
	});

	it("waits for renderer qualification before exposing readiness", async () => {
		const setup = _setup();
		const renderer = _deferred<void>();
		td.when(setup.rendererService.start(td.matchers.anything())).thenReturn(renderer.promise);
		const initializing = setup.application.initialize();
		await setImmediate();
		expect(td.explain(setup.mapSourceService.initialize).callCount).toBe(1);
		expect(td.explain(setup.rendererService.start).callCount).toBe(1);
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		renderer.resolve(undefined);
		await initializing;
		expect(setup.application.ready).toBe(true);
		await setup.application.close();
	});

	it("shares one initialization across repeated calls", async () => {
		const setup = _setup();
		const activation = _deferred<void>();
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReturn(activation.promise);
		const initializing = setup.application.initialize();
		expect(setup.application.initialize()).toBe(initializing);
		activation.resolve(undefined);
		await initializing;
		expect(setup.application.initialize()).toBe(initializing);
		expect(td.explain(setup.mapSourceService.initialize).callCount).toBe(1);
		expect(td.explain(setup.rendererService.start).callCount).toBe(1);
		await setup.application.close();
	});

	it("aborts immediately and hides readiness while shutdown drains", async () => {
		const setup = _setup();
		const renderer = _deferred<void>();
		td.when(setup.mapService.close()).thenReturn(renderer.promise);
		await setup.application.initialize();
		const closing = setup.application.close();
		expect(setup.application.signal.aborted).toBe(true);
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		renderer.resolve(undefined);
		await closing;
	});

	it("waits for pending startup and never becomes ready after shutdown", async () => {
		const setup = _setup();
		const activation = _deferred<void>();
		const renderer = _deferred<void>();
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReturn(activation.promise);
		td.when(setup.rendererService.start(td.matchers.anything())).thenReturn(renderer.promise);
		const initializing = setup.application.initialize();
		const closing = setup.application.close();
		activation.resolve(undefined);
		await setImmediate();
		expect(setup.application.ready).toBe(false);
		expect(td.explain(setup.rendererService.start).calls[0]?.args[0].signal.aborted).toBe(true);
		expect(td.explain(setup.mapService.close).callCount).toBe(0);
		renderer.resolve(undefined);
		await initializing;
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		await closing;
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
	});

	it("does not start resources after shutdown before initialization", async () => {
		const setup = _setup();
		await setup.application.close();
		await setup.application.initialize();
		expect(setup.application.signal.aborted).toBe(true);
		expect(setup.application.ready).toBe(false);
		expect(td.explain(setup.mapSourceService.initialize).callCount).toBe(0);
		expect(td.explain(setup.rendererService.start).callCount).toBe(0);
		expect(setup.events).toEqual([]);
	});

	it("drains map work before closing the engine, providers and map source files", async () => {
		const setup = _setup();
		const map = _deferred<void>();
		const renderer = _deferred<void>();
		const providers = _deferred<void>();
		td.when(setup.mapService.close()).thenReturn(map.promise);
		td.when(setup.rendererService.close()).thenReturn(renderer.promise);
		td.when(setup.tileResources.close()).thenReturn(providers.promise);
		await setup.application.initialize();
		const closing = setup.application.close();
		await setImmediate();
		expect(td.explain(setup.mapService.close).callCount).toBe(1);
		expect(td.explain(setup.rendererService.close).callCount).toBe(0);
		expect(td.explain(setup.tileResources.close).callCount).toBe(0);
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(0);
		map.resolve(undefined);
		await setImmediate();
		expect(td.explain(setup.rendererService.close).callCount).toBe(1);
		expect(td.explain(setup.tileResources.close).callCount).toBe(0);
		renderer.resolve(undefined);
		await setImmediate();
		expect(td.explain(setup.tileResources.close).callCount).toBe(1);
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(0);
		providers.resolve(undefined);
		await closing;
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(1);
	});

	it("shares pending shutdown and closes each owner once", async () => {
		const setup = _setup();
		const renderer = _deferred<void>();
		td.when(setup.mapService.close()).thenReturn(renderer.promise);
		await setup.application.initialize();
		const closing = setup.application.close();
		expect(setup.application.close()).toBe(closing);
		renderer.resolve(undefined);
		await closing;
		expect(setup.application.close()).toBe(closing);
		expect(td.explain(setup.mapService.close).callCount).toBe(1);
		expect(td.explain(setup.rendererService.close).callCount).toBe(1);
		expect(td.explain(setup.tileResources.close).callCount).toBe(1);
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(1);
	});

	it.each(["activation", "renderer"] as const)("cleans up every owner after %s initialization fails", async (stage) => {
		const setup = _setup();
		const failure = new Error(`${stage} initialization failed`);
		if (stage === "activation") td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReject(failure);
		if (stage === "renderer") td.when(setup.rendererService.start(td.matchers.anything())).thenReject(failure);
		await expect(setup.application.initialize()).rejects.toBe(failure);
		expect(setup.application.ready).toBe(false);
		expect(setup.application.indexes).toBeUndefined();
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
		await setup.application.close();
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
	});

	it("waits for late map source activation before cleaning up failed graphics", async () => {
		const setup = _setup();
		const activation = _deferred<void>();
		const failure = new Error("renderer initialization failed");
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReturn(activation.promise);
		td.when(setup.rendererService.start(td.matchers.anything())).thenReject(failure);
		const result = expect(setup.application.initialize()).rejects.toBe(failure);
		await setImmediate();
		expect(setup.events).toEqual([]);
		activation.resolve(undefined);
		await result;
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
	});

	it("waits for late renderer qualification before cleaning up failed activation", async () => {
		const setup = _setup();
		const renderer = _deferred<void>();
		const failure = new Error("map source activation failed");
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReject(failure);
		td.when(setup.rendererService.start(td.matchers.anything())).thenReturn(renderer.promise);
		const result = expect(setup.application.initialize()).rejects.toBe(failure);
		await setImmediate();
		expect(td.explain(setup.rendererService.start).callCount).toBe(1);
		expect(setup.events).toEqual([]);
		renderer.resolve(undefined);
		await result;
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
	});

	it("retains activation failure when both startup branches fail", async () => {
		const setup = _setup();
		const failure = new Error("map source activation failed");
		td.when(setup.mapSourceService.initialize(td.matchers.anything())).thenReject(failure);
		td.when(setup.rendererService.start(td.matchers.anything())).thenReject(
			new Error("renderer initialization failed"),
		);
		await expect(setup.application.initialize()).rejects.toBe(failure);
		expect(setup.events).toEqual(["map", "renderer", "tileResources", "mapSourceService"]);
	});

	it.each(["map", "renderer", "tileResources", "mapSourceService"] as const)(
		"continues cleanup after %s shutdown fails",
		async (stage) => {
			const setup = _setup();
			const failure = new Error(`${stage} shutdown failed`);
			const operations = {
				map: setup.mapService.close,
				renderer: setup.rendererService.close,
				tileResources: setup.tileResources.close,
				mapSourceService: setup.mapSourceService.close,
			};
			td.when(operations[stage]()).thenReject(failure);
			await setup.application.initialize();
			await expect(setup.application.close()).rejects.toBe(failure);
			expect(setup.application.ready).toBe(false);
			expect(td.explain(setup.mapService.close).callCount).toBe(1);
			expect(td.explain(setup.rendererService.close).callCount).toBe(1);
			expect(td.explain(setup.tileResources.close).callCount).toBe(1);
			expect(td.explain(setup.mapSourceService.close).callCount).toBe(1);
		},
	);

	it("retains startup and cleanup failures together", async () => {
		const setup = _setup();
		const startupFailure = new Error("renderer initialization failed");
		const cleanupFailure = new Error("renderer shutdown failed");
		td.when(setup.rendererService.start(td.matchers.anything())).thenReject(startupFailure);
		td.when(setup.rendererService.close()).thenReject(cleanupFailure);
		await expect(setup.application.initialize()).rejects.toMatchObject({
			name: "SuppressedError",
			error: cleanupFailure,
			suppressed: startupFailure,
		});
		expect(td.explain(setup.tileResources.close).callCount).toBe(1);
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(1);
		await setup.application.close();
	});

	it("retains multiple cleanup failures and still closes map source files", async () => {
		const setup = _setup();
		const rendererFailure = new Error("renderer shutdown failed");
		const resourcesFailure = new Error("providers shutdown failed");
		td.when(setup.rendererService.close()).thenReject(rendererFailure);
		td.when(setup.tileResources.close()).thenReject(resourcesFailure);
		await setup.application.initialize();
		await expect(setup.application.close()).rejects.toMatchObject({
			name: "SuppressedError",
			error: resourcesFailure,
			suppressed: rendererFailure,
		});
		expect(td.explain(setup.mapSourceService.close).callCount).toBe(1);
	});
});
