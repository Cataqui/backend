import { AppErrorCode, InvalidRenderingResourceError, RenderingResourceUnavailableError } from "../errors/index";

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as td from "testdouble";
import type { BasemapResourceRevision } from "./schemas/basemap-resource-revision.schema";
import type { MapSourceService } from "../source/map-source.service";
import { TileResourceService } from "./tile-resource.service";

afterEach(() => td.reset());

function _resource(params: { contents: string; path?: string }): _Resource {
	const bytes = Buffer.from(params.contents);
	const revision: BasemapResourceRevision = {
		id: createHash("sha256").update(bytes).digest("hex"),
		path: params.path ?? `/tiles/${"d".repeat(64)}/12/1/1.mvt`,
	};
	return { bytes: bytes, revision: revision };
}

function _storedResource(params: { contents?: string; path?: string } = {}): _Resource {
	const resource = _resource({
		contents: params.contents ?? "first",
		path: params.path ?? `/tiles/${"d".repeat(64)}/12/1/1.mvt`,
	});
	return resource;
}

function _mapSourceWithResources(resources: _Resource[]): MapSourceService {
	const mapSourceService = td.object<MapSourceService>();
	const byPath = new Map(resources.map((resource) => [resource.revision.path, resource]));
	td.when(mapSourceService.readResource(td.matchers.anything())).thenDo(
		async (input: Parameters<MapSourceService["readResource"]>[0]): ReturnType<MapSourceService["readResource"]> => {
			const resource = byPath.get(input.path);
			if (resource === undefined) throw new TypeError("Missing source fixture");
			return resource;
		},
	);
	return mapSourceService;
}

function _binaryResource(params: { byteLength: number; index: number }): _Resource {
	const bytes = Buffer.alloc(params.byteLength, params.index);
	return {
		bytes: bytes,
		revision: {
			id: createHash("sha256").update(bytes).digest("hex"),
			path: `/tiles/${"d".repeat(64)}/12/1/${params.index}.mvt`,
		},
	};
}

type _Resource = Awaited<ReturnType<TileResourceService["read"]>>;
describe("TileResourceService", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it("reads through the required map source with the shared cancellation signal", async () => {
		const resource = _storedResource();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenResolve(resource);
		const service = new TileResourceService(mapSourceService);
		expect(await service.read({ path: resource.revision.path })).toEqual(resource);
		expect(td.explain(mapSourceService.readResource).calls.map(({ args }) => args)).toEqual([
			[{ path: resource.revision.path, signal: expect.any(AbortSignal) }],
		]);
		await service.close();
	});
	it.each([new RenderingResourceUnavailableError(), new InvalidRenderingResourceError()])(
		"propagates the map source failure without a Worker fallback: %s",
		async (failure) => {
			const mapSourceService = td.object<MapSourceService>();
			td.when(mapSourceService.readResource(td.matchers.anything())).thenReject(failure);
			const service = new TileResourceService(mapSourceService);
			await expect(service.read({ path: _storedResource().revision.path })).rejects.toBe(failure);
			expect(td.explain(mapSourceService.readResource).callCount).toBe(1);
			await service.close();
		},
	);
	it("translates an unexpected map source provider failure into a resource error", async () => {
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReject(new Error("Provider failure"));
		const service = new TileResourceService(mapSourceService);
		await expect(service.read({ path: _storedResource().revision.path })).rejects.toMatchObject({
			errorCode: AppErrorCode.RESOURCE_UNAVAILABLE,
		});
		await service.close();
	});
	it("coalesces concurrent reads and isolates subscriber cancellation", async () => {
		const resource = _storedResource();
		const gate = Promise.withResolvers<_Resource>();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReturn(gate.promise);
		const service = new TileResourceService(mapSourceService);
		const controller = new AbortController();
		const first = service.read({ path: resource.revision.path, signal: controller.signal });
		const second = service.read({ path: resource.revision.path });
		const rejected = expect(first).rejects.toMatchObject({ errorCode: "ABORTED" });
		controller.abort();
		await rejected;
		gate.resolve(resource);
		expect(await second).toEqual(resource);
		expect(td.explain(mapSourceService.readResource).callCount).toBe(1);
		await service.close();
	});
	it("aborts shared work after its last subscriber leaves", async () => {
		const resource = _storedResource();
		const pending = Promise.withResolvers<_Resource>();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReturn(pending.promise);
		const service = new TileResourceService(mapSourceService);
		const controller = new AbortController();
		const first = service.read({ path: resource.revision.path, signal: controller.signal });
		const rejected = expect(first).rejects.toMatchObject({ errorCode: "ABORTED" });
		controller.abort();
		await rejected;
		expect(td.explain(mapSourceService.readResource).calls[0]?.args[0].signal.aborted).toBe(true);
		pending.resolve(resource);
		await service.close();
	});
	it("allows a source read to complete after ten seconds", async () => {
		vi.useFakeTimers();
		const timeout = td.replace(AbortSignal, "timeout");
		td.when(timeout(td.matchers.anything())).thenDo((milliseconds: number): AbortSignal => {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), milliseconds);
			return controller.signal;
		});
		const resource = _storedResource();
		const pending = Promise.withResolvers<_Resource>();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReturn(pending.promise);
		const service = new TileResourceService(mapSourceService);
		const operation = service.read({ path: resource.revision.path });
		const completed = operation.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(10_001);
		pending.resolve(resource);
		expect(await completed).toEqual(resource);
		await service.close();
	});
	it("waits for the source read to finish after aborting it during close", async () => {
		const resource = _storedResource();
		const pending = Promise.withResolvers<_Resource>();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReturn(pending.promise);
		const service = new TileResourceService(mapSourceService);
		const operation = service.read({ path: resource.revision.path });
		const failed = expect(operation).rejects.toMatchObject({ errorCode: AppErrorCode.RESOURCE_UNAVAILABLE });
		let closed = false;
		const closing = service.close().then(() => {
			closed = true;
		});
		await failed;
		expect(td.explain(mapSourceService.readResource).calls[0]?.args[0].signal.aborted).toBe(true);
		expect(closed).toBe(false);
		pending.resolve(resource);
		await closing;
		expect(closed).toBe(true);
		await expect(service.read({ path: resource.revision.path })).rejects.toMatchObject({
			errorCode: AppErrorCode.RESOURCE_UNAVAILABLE,
		});
	});
	it("accepts more than 128 distinct pending reads while coalescing subscribers", async () => {
		const resources = Array.from({ length: 129 }, (_, index) =>
			_storedResource({
				contents: `tile-${index}`,
				path: `/tiles/${"d".repeat(64)}/12/1/${index}.mvt`,
			}),
		);
		const completions = new Map<string, ReturnType<typeof Promise.withResolvers<_Resource>>>();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenDo(
			(input: Parameters<MapSourceService["readResource"]>[0]): ReturnType<MapSourceService["readResource"]> => {
				const pending = Promise.withResolvers<_Resource>();
				completions.set(input.path, pending);
				return pending.promise;
			},
		);
		const service = new TileResourceService(mapSourceService);
		const first = resources[0]!;
		const pending = Promise.all(resources.map((resource) => service.read({ path: resource.revision.path })));
		const completed = expect(pending).resolves.toEqual(resources);
		const coalesced = service.read({ path: first.revision.path });
		try {
			expect(td.explain(mapSourceService.readResource).callCount).toBe(129);
			completions.get(first.revision.path)!.resolve(first);
			await expect(coalesced).resolves.toEqual(first);
		} finally {
			for (const resource of resources) completions.get(resource.revision.path)?.resolve(resource);
			await completed;
			await coalesced;
			await service.close();
		}
	});
	it("rejects cancelled input before starting work", async () => {
		const mapSourceService = td.object<MapSourceService>();
		const service = new TileResourceService(mapSourceService);
		await expect(
			service.read({ path: _storedResource().revision.path, signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ errorCode: "ABORTED" });
		td.verify(mapSourceService.readResource(td.matchers.anything()), { times: 0 });
		await service.close();
	});
	it("does not accept late mapSourceService bytes after cancellation", async () => {
		const resource = _storedResource();
		const pending = Promise.withResolvers<_Resource>();
		const controller = new AbortController();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenReturn(pending.promise);
		const service = new TileResourceService(mapSourceService);
		const read = service.read({ path: resource.revision.path, signal: controller.signal });
		const failed = expect(read).rejects.toMatchObject({ errorCode: "ABORTED" });
		controller.abort();
		await failed;
		pending.resolve(resource);
		await service.close();
	});
	it("retains 2048 resource entries and evicts the least recently used entry when the next arrives", async () => {
		const resources = Array.from({ length: 2049 }, (_, index) =>
			_storedResource({
				contents: `tile-${index}`,
				path: `/tiles/${"d".repeat(64)}/12/1/${index}.mvt`,
			}),
		);
		const mapSourceService = _mapSourceWithResources(resources);
		const service = new TileResourceService(mapSourceService);
		for (const resource of resources.slice(0, 2048)) {
			await service.read({ path: resource.revision.path });
		}
		const first = resources[0]!;
		const second = resources[1]!;
		const extra = resources[2048]!;
		await service.read({ path: first.revision.path });
		expect(td.explain(mapSourceService.readResource).callCount).toBe(2048);
		await service.read({ path: extra.revision.path });
		await service.read({ path: first.revision.path });
		expect(td.explain(mapSourceService.readResource).callCount).toBe(2049);
		await service.read({ path: second.revision.path });
		expect(td.explain(mapSourceService.readResource).callCount).toBe(2050);
		await service.close();
	});
	it("retains 64 MiB of source bytes and evicts the least recently used tile before exceeding that budget", async () => {
		const resources = Array.from({ length: 9 }, (_, index) =>
			_binaryResource({
				byteLength: 8 * 1024 * 1024,
				index: index,
			}),
		);
		const mapSourceService = _mapSourceWithResources(resources);
		const service = new TileResourceService(mapSourceService);
		for (const resource of resources.slice(0, 8)) {
			await service.read({ path: resource.revision.path });
		}
		const first = resources[0]!;
		const second = resources[1]!;
		const extra = resources[8]!;
		const retained = await service.read({ path: first.revision.path });
		expect(retained.bytes).toBe(first.bytes);
		expect(td.explain(mapSourceService.readResource).callCount).toBe(8);
		await service.read({ path: extra.revision.path });
		await service.read({ path: first.revision.path });
		expect(td.explain(mapSourceService.readResource).callCount).toBe(9);
		await service.read({ path: second.revision.path });
		expect(td.explain(mapSourceService.readResource).callCount).toBe(10);
		await service.close();
	});
	it("returns resources larger than the cache budget without retaining them or evicting cached tiles", async () => {
		const cached = _storedResource();
		const oversized = _binaryResource({ byteLength: 64 * 1024 * 1024 + 1, index: 2 });
		const mapSourceService = _mapSourceWithResources([cached, oversized]);
		const service = new TileResourceService(mapSourceService);
		await service.read({ path: cached.revision.path });
		const first = await service.read({ path: oversized.revision.path });
		const second = await service.read({ path: oversized.revision.path });
		const retained = await service.read({ path: cached.revision.path });
		expect(first.bytes).toBe(oversized.bytes);
		expect(second.bytes).toBe(oversized.bytes);
		expect(first.bytes.byteLength).toBe(64 * 1024 * 1024 + 1);
		expect(retained.bytes).toBe(cached.bytes);
		expect(td.explain(mapSourceService.readResource).calls.map(({ args }) => args[0].path)).toEqual([
			cached.revision.path,
			oversized.revision.path,
			oversized.revision.path,
		]);
		await service.close();
	});
	it("preserves owned mapSourceService bytes and revision when reusing a cached tile", async () => {
		const resource = _storedResource();
		const mapSourceService = td.object<MapSourceService>();
		td.when(mapSourceService.readResource(td.matchers.anything())).thenResolve(resource);
		const service = new TileResourceService(mapSourceService);
		const first = await service.read({ path: resource.revision.path });
		const cached = await service.read({ path: resource.revision.path });
		expect(first.bytes).toBe(resource.bytes);
		expect(first.revision).toBe(resource.revision);
		expect(cached.bytes).toBe(resource.bytes);
		expect(cached.revision).toBe(resource.revision);
		expect(td.explain(mapSourceService.readResource).callCount).toBe(1);
		await service.close();
	});
	it("shares identical source content across paths while preserving each path's revision", async () => {
		const first = _storedResource();
		const second = _storedResource({ path: first.revision.path.replace("1/1.mvt", "1/2.mvt") });
		const mapSourceService = _mapSourceWithResources([first, second]);
		const service = new TileResourceService(mapSourceService);
		await service.read({ path: first.revision.path });
		await service.read({ path: second.revision.path });
		const cached = await service.read({ path: first.revision.path });
		expect(cached.bytes).toBe(second.bytes);
		expect(cached.revision).toBe(first.revision);
		expect(td.explain(mapSourceService.readResource).callCount).toBe(2);
		await service.close();
	});
});
