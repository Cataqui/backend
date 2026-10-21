import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as td from "testdouble";
import { createIndexFixture, indexFixtureSha } from "../../../test/basemap-index.fixture";
import {
	BasemapIndexPreparationService,
	type BasemapIndexPreparationRepository,
} from "./basemap-index-preparation.service";
import { BasemapIndexManifestSchema } from "../../../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";
import { BasemapPreparedIndexReferenceSchema } from "../../../src/tiles/sources/indexes/schemas/basemap-prepared-index-reference.schema";
import { TileIndexService } from "../../../src/tiles/tile-index.service";
import {
	getBasemapIndexFiles,
	readBasemapIndexHeader,
} from "../../../src/tiles/sources/indexes/basemap-index-manifest";

afterEach(() => td.reset());

describe("complete metadata-only basemap preparation", () => {
	it("publishes an index bundle the runtime reader uses to resolve and decode a source tile", async () => {
		const fixture = await createIndexFixture();
		const root = await mkdtemp(join(tmpdir(), "mapshot-generated-indexes-"));
		try {
			const files = getBasemapIndexFiles({ manifest: fixture.manifest });
			const manifest = fixture.objects.get(fixture.reference.manifestKey)!;
			expect(new TextDecoder().decode(manifest)).toBe(JSON.stringify(fixture.manifest));
			await mkdir(join(root, "files"));
			await writeFile(join(root, "manifest.json"), manifest);
			for (const file of files)
				await writeFile(join(root, file.path), fixture.objects.get(`source/indexes/v1/${file.path}`)!);
			await writeFile(join(root, "landmarks.pmtiles"), fixture.landmarks.bytes);
			await writeFile(
				join(root, "source.json"),
				JSON.stringify({ release: fixture.release, prepared: fixture.reference }),
			);
			const worker = td.object<MapshotWorkerPortal>();
			td.when(worker.withOptions(td.matchers.anything())).thenReturn(worker);
			td.when(worker.readObjectByteRange(td.matchers.anything())).thenDo(
				async (
					input: Parameters<MapshotWorkerPortal["readObjectByteRange"]>[0],
				): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> =>
					new Response(fixture.bytes.slice(input.offset, input.offset + input.length)).body!,
			);
			const reader = await TileIndexService.open({ root: root, worker: worker });
			try {
				const tile = await reader.readResource({ path: `/tiles/${fixture.release.pmtiles.id}/0/0/0.mvt` });
				expect(tile.bytes).toEqual(fixture.raw);
				expect(await reader.readSource()).toEqual(fixture.release);
			} finally {
				await reader.close();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("publishes every compressed leaf without copying tile payloads or reference snapshots", async () => {
		const fixture = await createIndexFixture({ largeLeaves: true });
		expect(fixture.manifest.metadata.leaves.map((leaf) => leaf.file.bytes)).toEqual([
			8 * 1024 * 1024,
			fixture.tileOffset - 16384 - 8 * 1024 * 1024,
		]);
		expect(fixture.ranges.every((range) => range.offset + range.length <= fixture.tileOffset)).toBe(true);
		expect(fixture.manifest.metadata.headerRoot.bytes).toBeLessThan(16384);
		expect(fixture.manifest).not.toHaveProperty("glyphs");
		expect(fixture.manifest).not.toHaveProperty("references");
		expect(fixture.manifest).not.toHaveProperty("vectors");
		expect(indexFixtureSha(fixture.objects.get(fixture.reference.manifestKey)!)).toBe(fixture.reference.sha256);
	});
	it("keeps the same bundle identity after changing environment keys and ETags", async () => {
		const fixture = await createIndexFixture();
		const release = structuredClone(fixture.release);
		release.pmtiles.objectKey = "production/planet.pmtiles";
		release.pmtiles.etag = "production-etag";
		const next = await new BasemapIndexPreparationService({ repository: fixture.repository }).prepare({
			release: release,
			landmarks: fixture.manifest.landmarks,
		});
		expect(next).toEqual(fixture.reference);
	});
	it("publishes new landmark content under a new immutable manifest without overwriting the same planet", async () => {
		const fixture = await createIndexFixture();
		const original = fixture.objects.get(fixture.reference.manifestKey);
		const landmarks = { ...fixture.manifest.landmarks, sha256: "0".repeat(64) };
		const release = structuredClone(fixture.release);
		release.references.id = landmarks.sha256;
		const next = await new BasemapIndexPreparationService({ repository: fixture.repository }).prepare({
			release: release,
			landmarks: landmarks,
		});
		expect(next.archiveId).toBe(fixture.reference.archiveId);
		expect(next.manifestKey).not.toBe(fixture.reference.manifestKey);
		expect(next.manifestKey).toBe(`source/indexes/v1/${next.archiveId}/${next.sha256}/manifest.json`);
		expect(fixture.objects.get(fixture.reference.manifestKey)).toEqual(original);
		expect(fixture.objects.has(next.manifestKey)).toBe(true);
	});

	it("supports an archive without leaves and copies only its exact header and root", async () => {
		const fixture = await createIndexFixture({ rootOnly: true });
		expect(fixture.manifest.metadata.leaves).toEqual([]);
		expect(fixture.ranges).toHaveLength(2);
	});
	it("preserves a range service failure without publishing a manifest", async () => {
		const fixture = await createIndexFixture();
		const repository = td.object<BasemapIndexPreparationRepository>();
		const failure = new Error("Stored archive range failed");
		td.when(repository.readRange(td.matchers.anything())).thenReject(failure);
		await expect(
			new BasemapIndexPreparationService({
				repository: repository,
			}).prepare({ release: fixture.release, landmarks: fixture.manifest.landmarks }),
		).rejects.toBe(failure);
		td.verify(repository.putObject(td.matchers.anything()), { times: 0 });
	});

	it("aborts before reading or publishing any bytes", async () => {
		const fixture = await createIndexFixture();
		const repository = td.object<BasemapIndexPreparationRepository>();
		await expect(
			new BasemapIndexPreparationService({ repository: repository }).prepare({
				release: fixture.release,
				landmarks: fixture.manifest.landmarks,
				signal: AbortSignal.abort(),
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		td.verify(repository.readRange(td.matchers.anything()), { times: 0 });
	});
	it("rejects unsafe addresses and discontinuous leaf metadata", async () => {
		const fixture = await createIndexFixture();
		const bad = structuredClone(fixture.manifest);
		bad.metadata.headerRoot.path = "../outside";
		expect(BasemapIndexManifestSchema.safeParse(bad).success).toBe(false);
		const gap = structuredClone(fixture.manifest);
		gap.metadata.leaves.push({
			originalOffset: gap.metadata.leaves[0]!.originalOffset + 1,
			file: gap.metadata.leaves[0]!.file,
		});
		expect(BasemapIndexManifestSchema.safeParse(gap).success).toBe(false);
		expect(
			BasemapPreparedIndexReferenceSchema.safeParse({ ...fixture.reference, archiveId: "f".repeat(64) }).success,
		).toBe(false);
		expect(getBasemapIndexFiles({ manifest: fixture.manifest })).toHaveLength(2);
	});
	it("rejects non-PMTiles headers and metadata extending into tile payloads", async () => {
		const fixture = await createIndexFixture();
		const bad = fixture.bytes.slice(0, 127);
		bad[7] = 2;
		expect(() => readBasemapIndexHeader({ bytes: bad, archive: fixture.manifest.archive })).toThrow();
		const overlapping = fixture.bytes.slice(0, 127);
		new DataView(overlapping.buffer).setBigUint64(56, 127n, true);
		expect(() => readBasemapIndexHeader({ bytes: overlapping, archive: fixture.manifest.archive })).toThrow();
	});
});
