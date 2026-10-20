import { UnrepresentableTileCoordinatesError } from "./errors/unrepresentable-tile-coordinates.error";
import { RenderingResourceUnavailableError } from "../errors/index";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { createHash } from "node:crypto";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeploymentCandidate } from "../../test/basemap-deployment.fixture";

import { MapSourceService } from "../source/map-source.service";
import { TileResourceService } from "./tile-resource.service";
import { TileService } from "./tile.service";

afterEach(() => td.reset());

function _input(params: { zoom?: number; width?: number; height?: number } = {}): MapshotRenderInput {
	const zoom = params.zoom ?? 13;
	const extent = 2 ** zoom;
	const tileCenter = extent / 2 + 0.5;
	return {
		center: {
			longitude: (tileCenter / extent) * 360 - 180,
			latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileCenter) / extent))) * 180) / Math.PI,
		},
		zoom: zoom,
		size: { width: params.width ?? 480, height: params.height ?? 480 },
	};
}

function _resource(params: { path: string; bytes: Uint8Array }): Awaited<ReturnType<TileResourceService["read"]>> {
	return {
		bytes: params.bytes,
		revision: {
			id: createHash("sha256").update(params.bytes).digest("hex"),
			path: params.path,
		},
	};
}

function _fixture(bytes: Uint8Array = Uint8Array.of(0, 128, 255)): {
	service: TileService;
	tileResourceService: TileResourceService;
	mapSourceService: MapSourceService;
	source: ReturnType<typeof createDeploymentCandidate>["release"];
} {
	const tileResourceService = td.object<TileResourceService>();
	td.when(tileResourceService.read(td.matchers.anything())).thenDo(
		async (params: Parameters<TileResourceService["read"]>[0]): ReturnType<TileResourceService["read"]> =>
			_resource({ path: params.path, bytes: bytes }),
	);
	const source = createDeploymentCandidate().release;
	const mapSourceService = td.object<MapSourceService>();
	td.when(mapSourceService.readSource()).thenResolve(source);
	return {
		service: new TileService(tileResourceService, mapSourceService),
		tileResourceService: tileResourceService,
		mapSourceService: mapSourceService,
		source: source,
	};
}

function _load(service: TileService, input: MapshotRenderInput = _input()): ReturnType<TileService["loadForRender"]> {
	return service.loadForRender({ input: input, signal: new AbortController().signal });
}

describe("TileService", () => {
	it("loads exact source bytes with their address and immutable key", async () => {
		const bytes = Uint8Array.of(0, 128, 255);
		const fixture = _fixture(bytes);
		const controller = new AbortController();
		const tiles = await fixture.service.loadForRender({ input: _input(), signal: controller.signal });
		const path = `/tiles/${fixture.source.pmtiles.id}/13/4096/4096.mvt`;
		const resource = _resource({ path: path, bytes: bytes });
		td.verify(fixture.tileResourceService.read({ path: path, signal: controller.signal }));
		expect(tiles).toEqual([
			{
				key: `${path}:${resource.revision.id}`,
				address: { z: 13, x: 4096, y: 4096 },
				worldOffset: 0,
				bytes: bytes,
			},
		]);
		expect(tiles[0]?.bytes).toBe(bytes);
	});

	it("retains an absent source tile as an empty tile", async () => {
		const bytes = new Uint8Array();
		const fixture = _fixture(bytes);
		const tiles = await _load(fixture.service);
		expect(tiles).toHaveLength(1);
		expect(tiles[0]?.bytes).toBe(bytes);
	});

	it("reads through the resource owner on every load", async () => {
		const fixture = _fixture();
		const first = await _load(fixture.service);
		td.when(fixture.tileResourceService.read(td.matchers.anything()), { times: 1 }).thenDo(
			async (params: Parameters<TileResourceService["read"]>[0]): ReturnType<TileResourceService["read"]> =>
				_resource({ path: params.path, bytes: Uint8Array.of(2) }),
		);
		const second = await _load(fixture.service);
		expect(td.explain(fixture.tileResourceService.read).callCount).toBe(2);
		expect(second[0]?.bytes).toEqual(Uint8Array.of(2));
		expect(second[0]?.key).not.toBe(first[0]?.key);
	});

	it("preserves a failed source lookup", async () => {
		const fixture = _fixture();
		const failure = new RenderingResourceUnavailableError();
		td.when(fixture.mapSourceService.readSource()).thenReject(failure);
		await expect(_load(fixture.service)).rejects.toBe(failure);
		td.verify(fixture.tileResourceService.read(td.matchers.anything()), { times: 0 });
	});

	it("preserves a failed resource read after an earlier successful load", async () => {
		const fixture = _fixture();
		await _load(fixture.service);
		const failure = new RenderingResourceUnavailableError();
		td.when(fixture.tileResourceService.read(td.matchers.anything()), { times: 1 }).thenReject(failure);
		await expect(_load(fixture.service)).rejects.toBe(failure);
	});

	it("uses the published maximum source zoom for a closer camera", async () => {
		const fixture = _fixture();
		const tiles = await _load(fixture.service, _input({ zoom: 16 }));
		expect(tiles.length).toBeGreaterThan(0);
		expect(tiles.every((tile) => tile.address.z === fixture.source.pmtiles.maxZoom)).toBe(true);
	});

	it("uses the published minimum source zoom for a wider camera", async () => {
		const fixture = _fixture();
		fixture.source.pmtiles.minZoom = 1;
		const tiles = await _load(fixture.service, _input({ zoom: 0 }));
		expect(tiles.length).toBeGreaterThan(0);
		expect(tiles.every((tile) => tile.address.z === 1)).toBe(true);
	});

	it("uses the lower whole source zoom for a fractional camera zoom", async () => {
		const fixture = _fixture();
		const tiles = await _load(fixture.service, _input({ zoom: 7.5 }));
		expect(tiles.length).toBeGreaterThan(0);
		expect(tiles.every((tile) => tile.address.z === 7)).toBe(true);
	});

	it.each([
		{ zoom: 0, width: 1536, height: 256 },
		{ zoom: -1, width: 768, height: 128 },
	])("preserves repeated world copies at zoom $zoom", async ({ zoom, width, height }) => {
		const fixture = _fixture();
		const input = _input({ zoom: zoom, width: width, height: height });
		input.center = { latitude: 0, longitude: 0 };
		const tiles = await _load(fixture.service, input);
		expect(tiles.map((tile) => tile.address)).toEqual([
			{ z: 0, x: 0, y: 0 },
			{ z: 0, x: 0, y: 0 },
			{ z: 0, x: 0, y: 0 },
		]);
		expect(tiles.map((tile) => tile.worldOffset)).toEqual([-1, 0, 1]);
		expect(new Set(tiles.map((tile) => tile.key)).size).toBe(1);
	});

	it("rejects tile coordinates that cannot be represented as exact integers", async () => {
		const fixture = _fixture();
		const input = _input({ zoom: -1000 });
		input.center = { latitude: 0, longitude: 0 };
		await expect(_load(fixture.service, input)).rejects.toThrow(UnrepresentableTileCoordinatesError);
		td.verify(fixture.tileResourceService.read(td.matchers.anything()), { times: 0 });
	});

	it.each([-180, 180])("wraps source tiles at longitude %s", async (longitude) => {
		const fixture = _fixture();
		const input = _input();
		input.center.longitude = longitude;
		const tiles = await _load(fixture.service, input);
		expect(tiles.map((tile) => tile.address.x)).toEqual([8191, 0]);
	});

	it.each([-85.0511287798066, 85.0511287798066])("clips source rows at Mercator latitude %s", async (latitude) => {
		const fixture = _fixture();
		const input = _input();
		input.center.latitude = latitude;
		const tiles = await _load(fixture.service, input);
		expect(tiles).toHaveLength(1);
		expect(tiles[0]?.address.y).toBe(latitude > 0 ? 0 : 8191);
	});

	it.each([
		{ latitude: -85.0511287798066, longitude: -180 },
		{ latitude: -85.0511287798066, longitude: 180 },
		{ latitude: 85.0511287798066, longitude: -180 },
		{ latitude: 85.0511287798066, longitude: 180 },
		{ latitude: 0, longitude: 0 },
	])("loads only valid source addresses for a large viewport at $latitude $longitude", async (center) => {
		const fixture = _fixture();
		const input = _input({ width: 6000, height: 3000 });
		input.center = { latitude: center.latitude, longitude: center.longitude };
		const tiles = await _load(fixture.service, input);
		expect(tiles.length).toBeGreaterThan(0);
		for (const { address } of tiles) {
			expect(Number.isInteger(address.z)).toBe(true);
			expect(address.z).toBeGreaterThanOrEqual(fixture.source.pmtiles.minZoom);
			expect(address.z).toBeLessThanOrEqual(fixture.source.pmtiles.maxZoom);
			for (const coordinate of [address.x, address.y]) {
				expect(Number.isInteger(coordinate)).toBe(true);
				expect(coordinate).toBeGreaterThanOrEqual(0);
				expect(coordinate).toBeLessThan(2 ** address.z);
			}
		}
	});

	it("loads each viewport location once in batches of eight", async () => {
		const fixture = _fixture();
		let active = 0;
		let maximum = 0;
		td.when(fixture.tileResourceService.read(td.matchers.anything())).thenDo(
			async (params: Parameters<TileResourceService["read"]>[0]): ReturnType<TileResourceService["read"]> => {
				active += 1;
				maximum = Math.max(maximum, active);
				await Promise.resolve();
				active -= 1;
				return _resource({ path: params.path, bytes: new Uint8Array() });
			},
		);
		const tiles = await _load(fixture.service, _input({ width: 2048, height: 2048 }));
		expect(tiles.length).toBeGreaterThan(8);
		expect(maximum).toBe(8);
		expect(td.explain(fixture.tileResourceService.read).callCount).toBe(tiles.length);
		expect(new Set(tiles.map((tile) => `${tile.address.x}:${tile.address.y}`)).size).toBe(tiles.length);
	});

	it("waits for sibling reads before rejecting a failed batch", async () => {
		const fixture = _fixture();
		const failure = new RenderingResourceUnavailableError();
		const releases: (() => void)[] = [];
		td.when(fixture.tileResourceService.read(td.matchers.anything())).thenDo(
			(params: Parameters<TileResourceService["read"]>[0]): ReturnType<TileResourceService["read"]> =>
				new Promise((resolve) => {
					releases.push(() => resolve(_resource({ path: params.path, bytes: new Uint8Array() })));
				}),
		);
		td.when(fixture.tileResourceService.read(td.matchers.anything()), { times: 1 }).thenReject(failure);
		let settled = false;
		const operation = _load(fixture.service, _input({ width: 960 })).catch((error: unknown) => {
			settled = true;
			throw error;
		});
		await vi.waitFor(() => expect(td.explain(fixture.tileResourceService.read).callCount).toBe(3));
		expect(settled).toBe(false);
		for (const release of releases) release();
		await expect(operation).rejects.toBe(failure);
	});

	it("rejects cancellation before looking up the source", async () => {
		const fixture = _fixture();
		await expect(fixture.service.loadForRender({ input: _input(), signal: AbortSignal.abort() })).rejects.toMatchObject(
			{
				errorCode: "ABORTED",
			},
		);
		td.verify(fixture.mapSourceService.readSource(), { times: 0 });
		td.verify(fixture.tileResourceService.read(td.matchers.anything()), { times: 0 });
	});

	it("rejects cancellation after the source lookup", async () => {
		const fixture = _fixture();
		const controller = new AbortController();
		td.when(fixture.mapSourceService.readSource()).thenDo(async (): ReturnType<MapSourceService["readSource"]> => {
			controller.abort();
			return fixture.source;
		});
		await expect(fixture.service.loadForRender({ input: _input(), signal: controller.signal })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		td.verify(fixture.tileResourceService.read(td.matchers.anything()), { times: 0 });
	});

	it("rejects cancellation after a resource resolves", async () => {
		const fixture = _fixture();
		const controller = new AbortController();
		td.when(fixture.tileResourceService.read(td.matchers.anything())).thenDo(
			async (params: Parameters<TileResourceService["read"]>[0]): ReturnType<TileResourceService["read"]> => {
				controller.abort();
				return _resource({ path: params.path, bytes: new Uint8Array() });
			},
		);
		await expect(fixture.service.loadForRender({ input: _input(), signal: controller.signal })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
	});
});
