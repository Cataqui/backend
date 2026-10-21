import { InvalidRenderingResourceError, RenderingResourceUnavailableError } from "../../src/errors/index";
import type { MapshotRenderInput } from "@cataqui/mapshot-workerhole";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import "reflect-metadata";
import * as td from "testdouble";
import type { LandmarkService } from "../../src/landmark/landmark.service";
import { MapService } from "../../src/map/map.service";
import { EngineAssetsService } from "../../src/renderer/engine-assets.service";
import { RendererProcessRepository } from "../../src/renderer/renderer-process.repository";
import { RendererService } from "../../src/renderer/renderer.service";
import type { BasemapResourceRevision } from "../../src/tiles/schemas/basemap-resource-revision.schema";
import { TileResourceService } from "../../src/tiles/tile-resource.service";
import { TileService } from "../../src/tiles/tile.service";
import { EngineFixtureSchema, type EngineFixture } from "./schemas/engine-fixture.schema";

type _Resource = { bytes: Uint8Array; revision: BasemapResourceRevision };
const _hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Test-only finite source boundary, shared by the committed Linux gate and promotion qualification. */
export async function loadEngineFixture(params: { directory: string }): Promise<{
	manifest: EngineFixture;
	resources: Map<string, { file: string; revision: BasemapResourceRevision }>;
	getInput(params: { snapshot: EngineFixture["snapshots"][number] }): MapshotRenderInput;
}> {
	const manifest = EngineFixtureSchema.parse(
		JSON.parse(await readFile(join(params.directory, "manifest.json"), "utf8")),
	);
	const resources = new Map<string, { file: string; revision: BasemapResourceRevision }>();
	for (const resource of manifest.resources) {
		const compressed = await readFile(join(params.directory, resource.file));
		if (compressed.byteLength !== resource.compressedBytes || _hash(compressed) !== resource.compressedSha256)
			throw new Error(`Pinned integration fixture differs: ${resource.file}`);
		const bytes = gunzipSync(compressed);
		if (_hash(bytes) !== resource.revision.id)
			throw new Error(`Pinned integration vector tile differs: ${resource.file}`);
		if (resources.has(resource.revision.path)) throw new Error("Duplicate integration resource path");
		resources.set(resource.revision.path, { file: join(params.directory, resource.file), revision: resource.revision });
	}
	return {
		manifest: manifest,
		resources: resources,
		getInput: (params: { snapshot: EngineFixture["snapshots"][number] }): MapshotRenderInput =>
			structuredClone({
				center: {
					latitude: params.snapshot.input.center.latitude,
					longitude: params.snapshot.input.center.longitude,
				},
				zoom: params.snapshot.input.zoom,
				size: { width: params.snapshot.input.size.width, height: params.snapshot.input.size.height },
			}),
	};
}

export async function createEngineFixtureRenderer(params: {
	fixture: Awaited<ReturnType<typeof loadEngineFixture>>;
	assetsDirectory: string;
	readLocal?: (input: { path: string; resource: _Resource | undefined }) => Promise<_Resource>;
}): Promise<{
	service: MapService;
	close(): Promise<void>;
	engine: RendererService;
	activity: {
		localReads: string[];
		draws: number;
		diagnostics: Awaited<ReturnType<RendererService["render"]>>["diagnostics"][];
	};
}> {
	const assetsService = Object.assign(td.object<EngineAssetsService>(), {
		fontRoot: join(params.assetsDirectory, "fonts"),
		badges: new Map(
			[...new EngineAssetsService().badges].map(([category, badge]) => [
				category,
				{
					path: join(params.assetsDirectory, "landmarks", basename(badge.path)),
					logicalSize: badge.logicalSize,
				},
			]),
		),
	});
	const activity = {
		localReads: [] as string[],
		draws: 0,
		diagnostics: [] as Awaited<ReturnType<RendererService["render"]>>["diagnostics"][],
	};
	class _InstrumentedRenderer extends RendererService {
		override async start(input: Parameters<RendererService["start"]>[0]): Promise<void> {
			await super.start({ signal: input.signal });
			activity.draws += 1;
		}
		override async render(input: Parameters<RendererService["render"]>[0]): ReturnType<RendererService["render"]> {
			activity.draws += 1;
			const result = await super.render({
				input: input.input,
				tiles: input.tiles,
				landmarks: input.landmarks,
				signal: input.signal,
			});
			activity.diagnostics.push(result.diagnostics);
			return result;
		}
	}
	const engine = new _InstrumentedRenderer(new RendererProcessRepository(assetsService), assetsService);
	const local = td.object<ConstructorParameters<typeof TileResourceService>[0]>();
	td.when(local.readResource(td.matchers.anything())).thenDo(
		async (input: Parameters<typeof local.readResource>[0]): ReturnType<typeof local.readResource> => {
			activity.localReads.push(input.path);
			const stored = params.fixture.resources.get(input.path);
			const resource =
				stored === undefined
					? undefined
					: { bytes: gunzipSync(await readFile(stored.file)), revision: stored.revision };
			if (params.readLocal !== undefined) return params.readLocal({ path: input.path, resource: resource });
			if (resource === undefined) throw new RenderingResourceUnavailableError();
			return resource;
		},
	);
	const resources = new TileResourceService(local);
	td.when(local.readSource()).thenResolve(params.fixture.manifest.source);
	const tiles = new TileService(resources, local);
	const landmarks = td.object<LandmarkService>();
	td.when(landmarks.findForRender(td.matchers.anything())).thenDo(
		async ({
			input,
		}: Parameters<LandmarkService["findForRender"]>[0]): ReturnType<LandmarkService["findForRender"]> => {
			const snapshot = params.fixture.manifest.snapshots.find(
				(snapshot) =>
					snapshot.input.center.latitude === input.center.latitude &&
					snapshot.input.center.longitude === input.center.longitude &&
					snapshot.input.zoom === input.zoom &&
					snapshot.input.size.width >= input.size.width &&
					snapshot.input.size.height >= input.size.height,
			);
			if (snapshot === undefined) throw new InvalidRenderingResourceError();
			return structuredClone(snapshot.input.catalogue.landmarks);
		},
	);
	const service = new MapService(tiles, landmarks, engine);
	return {
		service: service,
		engine: engine,
		activity: activity,
		close: async (): Promise<void> => {
			try {
				await service.close();
			} finally {
				await engine.close();
			}
		},
	};
}
