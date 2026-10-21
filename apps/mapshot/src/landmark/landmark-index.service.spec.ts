import { RenderingResourceUnavailableError } from "../errors/index";
import * as td from "testdouble";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PMTiles } from "pmtiles";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPackedLandmarkIndexFixture } from "../../test/landmark-index.fixture";
import { LandmarkIndexService } from "./landmark-index.service";
import { LandmarkIndexRepository } from "./landmark-index.repository";

const _resources: { path: string; service?: LandmarkIndexService }[] = [];
afterEach(() => td.reset());

afterEach(async () => {
	vi.restoreAllMocks();
	for (const resource of _resources.splice(0)) {
		await resource.service?.close();
		rmSync(resource.path, { recursive: true, force: true });
	}
});

function _fixture(params: Parameters<typeof createPackedLandmarkIndexFixture>[0] = {}): ReturnType<
	typeof createPackedLandmarkIndexFixture
> & {
	path: string;
	open: () => Promise<LandmarkIndexService>;
} {
	const archive = createPackedLandmarkIndexFixture(params);
	const directory = mkdtempSync(join(tmpdir(), "mapshot-packed-index-"));
	const path = join(directory, "landmarks.pmtiles");
	writeFileSync(path, archive.bytes);
	const resource: { path: string; service?: LandmarkIndexService } = { path: directory };
	_resources.push(resource);
	return {
		...archive,
		path: path,
		open: async (): Promise<LandmarkIndexService> => {
			const service = await LandmarkIndexService.open({ path: path, reference: archive.reference });
			resource.service = service;
			return service;
		},
	};
}

const _camera = { center: { latitude: -23.55, longitude: -46.63 }, zoom: 13, size: { width: 512, height: 512 } };

describe("LandmarkIndexService", () => {
	it("rejects cancelled startup before attempting to open a missing file", async () => {
		const fixture = _fixture();
		await expect(
			LandmarkIndexService.open({
				path: join(fixture.path, "missing"),
				reference: fixture.reference,
				signal: AbortSignal.abort(),
			}),
		).rejects.toMatchObject({ errorCode: "ABORTED" });
	});

	it("closes the opened file when startup is cancelled during metadata loading", async () => {
		const fixture = _fixture();
		const controller = new AbortController();
		const original = PMTiles.prototype.getMetadata;
		const metadata = td.replace(PMTiles.prototype, "getMetadata");
		td.when(metadata()).thenDo(async function (this: PMTiles): ReturnType<PMTiles["getMetadata"]> {
			const result = await original.call(this);
			controller.abort();
			return result;
		});
		const close = vi.spyOn(LandmarkIndexRepository.prototype, "close");
		await expect(
			LandmarkIndexService.open({
				path: fixture.path,
				reference: fixture.reference,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ errorCode: "ABORTED" });
		expect(close).toHaveBeenCalledOnce();
	});

	it("classifies a missing file as an invalid rendering resource", async () => {
		const fixture = _fixture();
		await expect(
			LandmarkIndexService.open({
				path: join(fixture.path, "missing"),
				reference: fixture.reference,
			}),
		).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});

	it("preserves an owned cell-read failure without replacing its meaning", async () => {
		const service = await _fixture().open();
		const failure = new RenderingResourceUnavailableError();
		const read = td.replace(PMTiles.prototype, "getZxy");
		td.when(read(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			ignoreExtraArgs: true,
		}).thenReject(failure);
		await expect(service.query(_camera)).rejects.toBe(failure);
	});

	it("reads an exact uint64 reference from the bundled worldwide archive and returns isolated records", async () => {
		const service = await _fixture().open();
		const first = await service.query(_camera);
		expect(first).toEqual([
			{
				id: "pois:library:18446744073709551615",
				label: "Biblioteca",
				alternativeLabels: [],
				coordinates: { latitude: -23.55, longitude: -46.63 },
				kind: "library",
				kindDetail: null,
				minZoom: 13,
				rank: null,
			},
		]);
		first[0]!.label = "Changed by caller";
		expect((await service.query(_camera))[0]!.label).toBe("Biblioteca");
	});

	it("preserves every provider alternative, empty primary names and literal Unicode separators", async () => {
		const fixture = _fixture({
			rows: [
				[
					"8",
					"",
					{
						"name:bo": "བོད་",
						name2: "विद्यालय\u2028学校\u2029مدرسة",
						"name:ja": "学校",
					},
					"school",
					null,
					-46.63,
					-23.55,
					null,
					4,
				],
			],
		});
		const service = await fixture.open();
		const result = await service.query(_camera);
		expect(result[0]).toMatchObject({
			id: "pois:school:8",
			label: "",
			rank: 4,
			alternativeLabels: ["བོད་", "विद्यालय\u2028学校\u2029مدرسة", "学校"],
		});
	});

	it("returns no records outside populated cells", async () => {
		const service = await _fixture().open();
		expect(
			await service.query({ center: { latitude: 0, longitude: 10 }, zoom: 13, size: { width: 512, height: 512 } }),
		).toEqual([]);
	});

	it("reads both sides of the international date line exactly once", async () => {
		const fixture = _fixture({
			rows: [
				["1", "学校", {}, "school", null, 179.995, -16, 12, null],
				["2", "Library", {}, "library", null, -179.995, -16, 12, null],
			],
		});
		const service = await fixture.open();
		const result = await service.query({
			center: { latitude: -16, longitude: 180 },
			zoom: 13,
			size: { width: 512, height: 512 },
		});
		expect(result.map((record) => record.id).sort()).toEqual(["pois:library:2", "pois:school:1"]);
	});

	it("clips polar cells without reading outside the valid Mercator grid", async () => {
		const service = await _fixture().open();
		for (const latitude of [-85.05112878, 85.05112878])
			expect(
				await service.query({
					center: { latitude: latitude, longitude: 0 },
					zoom: 13,
					size: { width: 512, height: 512 },
				}),
			).toEqual([]);
	});

	it.each([97, 98, 99, 100, 101])("rejects an unsupported header field at byte %i before serving", async (offset) => {
		const fixture = _fixture();
		fixture.bytes[offset] = 7;
		writeFileSync(fixture.path, fixture.bytes);
		await expect(fixture.open()).rejects.toThrow();
	});

	it("rejects a descriptor with a different file size", async () => {
		const fixture = _fixture();
		await expect(
			LandmarkIndexService.open({
				path: fixture.path,
				reference: { ...fixture.reference, bytes: fixture.reference.bytes + 1 },
			}),
		).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});

	it("rejects metadata claiming unsupported coverage or counts", async () => {
		for (const metadata of [{ coverage: "brazil" }, { cells: 2 }, { records: 0 }, { records: 2, cells: 2 }])
			await expect(_fixture({ metadata: metadata }).open()).rejects.toThrow();
	});

	it("serves more than eight concurrent queries while retaining independent cancellation", async () => {
		const service = await _fixture().open();
		const controller = new AbortController();
		const cancelled = service.query({ ..._camera, signal: controller.signal });
		const running = Array.from({ length: 9 }, () => service.query(_camera));
		controller.abort();
		await expect(cancelled).rejects.toMatchObject({ errorCode: "ABORTED" });
		expect((await Promise.all(running)).every((result) => result.length === 1)).toBe(true);
		expect(await service.query(_camera)).toHaveLength(1);
	});

	it("shares each cold cell read and cache admission across simultaneous queries", async () => {
		const service = await _fixture().open();
		const read = vi.spyOn(PMTiles.prototype, "getZxy");
		const results = await Promise.all(Array.from({ length: 8 }, () => service.query(_camera)));
		expect(results.every((result) => result.length === 1)).toBe(true);
		expect(read).toHaveBeenCalledTimes(4);
		await service.query(_camera);
		expect(read).toHaveBeenCalledTimes(4);
	});

	it("does not let an aborted caller cancel another caller's shared cold cells", async () => {
		const service = await _fixture().open();
		const read = vi.spyOn(PMTiles.prototype, "getZxy");
		const controller = new AbortController();
		const cancelled = service.query({ ..._camera, signal: controller.signal });
		const successful = service.query(_camera);
		controller.abort();
		await expect(cancelled).rejects.toMatchObject({ errorCode: "ABORTED" });
		expect(await successful).toHaveLength(1);
		expect(read).toHaveBeenCalledTimes(4);
	});

	it("retries a failed shared cell load instead of caching a rejected promise", async () => {
		const service = await _fixture().open();
		const original = PMTiles.prototype.getZxy;
		const read = td.replace(PMTiles.prototype, "getZxy");
		let interruptedRead = false;
		td.when(read(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			ignoreExtraArgs: true,
		}).thenDo(async function (this: PMTiles, ...args: Parameters<PMTiles["getZxy"]>): ReturnType<PMTiles["getZxy"]> {
			if (!interruptedRead) {
				interruptedRead = true;
				throw new Error("Fixture read interrupted");
			}
			return original.apply(this, args);
		});
		const interrupted = await Promise.allSettled(Array.from({ length: 8 }, () => service.query(_camera)));
		expect(interrupted.every((result) => result.status === "rejected")).toBe(true);
		expect(td.explain(read).callCount).toBe(1);
		expect(await service.query(_camera)).toHaveLength(1);
		expect(td.explain(read).callCount).toBe(5);
	});

	it("evicts old cached cells and can read their canonical records again", async () => {
		const service = await _fixture().open();
		await service.query(_camera);
		for (let column = 0; column < 513; column++)
			await service.query({
				center: { latitude: 10, longitude: ((column + 0.5) / 8192) * 360 - 180 },
				zoom: 13,
				size: { width: 1, height: 1 },
			});
		expect((await service.query(_camera))[0]?.id).toBe("pois:library:18446744073709551615");
	});

	it("rejects an out-of-file archive section before serving", async () => {
		const fixture = _fixture();
		new DataView(fixture.bytes.buffer).setBigUint64(64, BigInt(fixture.bytes.byteLength * 2), true);
		writeFileSync(fixture.path, fixture.bytes);
		await expect(fixture.open()).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});

	it("rejects a truncated gzip tile rather than returning incomplete landmarks", async () => {
		const fixture = _fixture();
		fixture.bytes[fixture.bytes.byteLength - 8] = (fixture.bytes[fixture.bytes.byteLength - 8] ?? 0) ^ 0xff;
		writeFileSync(fixture.path, fixture.bytes);
		const service = await fixture.open();
		await expect(service.query(_camera)).rejects.toThrow();
	});

	it("returns landmarks when a camera covers more than 64 index cells", async () => {
		const service = await _fixture().open();
		expect(await service.query({ ..._camera, zoom: 11, size: { width: 4096, height: 4096 } })).toHaveLength(1);
	});

	it("reads packed cells beyond the former decoded-cell and aggregate-query byte budgets", async () => {
		const label = "a".repeat(17 * 1024 * 1024);
		const service = await _fixture({
			rows: [
				["1", label, {}, "library", null, 0, 0, 13, null],
				["2", label, {}, "library", null, 0.05, 0, 13, null],
			],
		}).open();
		const result = await service.query({
			center: { latitude: 0, longitude: 0 },
			zoom: 13,
			size: { width: 2048, height: 1 },
		});
		expect(result.map((record) => record.id)).toEqual(["pois:library:1", "pois:library:2"]);
		expect(result.every((record) => record.label === label)).toBe(true);
	});

	it("reads each longitude cell once for a view wider than the world", async () => {
		const fixture = _fixture({ rows: [["1", "Library", {}, "library", null, 0, 0, 13, null]] });
		const service = await fixture.open();
		const result = await service.query({
			center: { latitude: 0, longitude: 0 },
			zoom: 11,
			size: { width: 512 * 2 ** 12, height: 1 },
		});
		expect(result.map((record) => record.id)).toEqual(["pois:library:1"]);
	});

	it("supports cancellation and idempotent shutdown without leaving reads alive", async () => {
		const service = await _fixture().open();
		expect(() => service.query({ ..._camera, signal: AbortSignal.abort() })).toThrow();
		const signal = new AbortController();
		const cancelled = service.query({ ..._camera, signal: signal.signal });
		signal.abort();
		await expect(cancelled).rejects.toMatchObject({ errorCode: "ABORTED" });
		const pending = service.query(_camera);
		const closed = service.close();
		expect(service.close()).toBe(closed);
		await expect(pending).rejects.toThrow();
		await closed;
		expect(() => service.query(_camera)).toThrow();
	});
});
