import { AppErrorCode } from "../errors/index";
import { type CallOptions } from "@cataqui/workerhole";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Compression, PMTiles } from "pmtiles";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TileIndexService } from "./tile-index.service";
import { createIndexFixture, indexFixtureSha } from "../../test/basemap-index.fixture";
import { getBasemapIndexFiles } from "./sources/indexes/basemap-index-manifest";
import { BasemapIndexInstallationService } from "./indexes/basemap-index-installation.service";

import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";

function _worker(read: MapshotWorkerPortal["readObjectByteRange"]): MapshotWorkerPortal {
	const client = td.object<MapshotWorkerPortal>();
	client.readObjectByteRange = read;
	const worker = td.object<MapshotWorkerPortal>();
	td.when(worker.withOptions(td.matchers.anything())).thenReturn(client);
	return worker;
}

afterEach(() => td.reset());

const _roots: string[] = [];
const _readers: TileIndexService[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(_readers.splice(0).map((reader) => reader.close()));
	await Promise.all(_roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function _installed(
	params: { rootOnly?: boolean; splitLeaf?: boolean; leavesAfterTiles?: boolean } = {},
): Promise<
	Awaited<ReturnType<typeof createIndexFixture>> & {
		root: string;
		tilePath: string;
	}
> {
	const fixture = await createIndexFixture(params);
	const root = await mkdtemp(join(tmpdir(), "maps-indexes-"));
	_roots.push(root);
	await mkdir(join(root, "files"));
	await writeFile(join(root, "manifest.json"), fixture.objects.get(fixture.reference.manifestKey)!);
	for (const file of getBasemapIndexFiles({ manifest: fixture.manifest }))
		await writeFile(join(root, file.path), fixture.objects.get(`source/indexes/v1/${file.path}`)!);
	await writeFile(join(root, "landmarks.pmtiles"), fixture.landmarks.bytes);
	await writeFile(join(root, "source.json"), JSON.stringify({ release: fixture.release, prepared: fixture.reference }));
	const tilePath = `/tiles/${fixture.release.pmtiles.id}/0/0/0.mvt`;
	return { ...fixture, root: root, tilePath: tilePath };
}
async function _reader(params: Parameters<typeof TileIndexService.open>[0]): Promise<TileIndexService> {
	const reader = await TileIndexService.open(params);
	_readers.push(reader);
	return reader;
}
function _response(bytes: Uint8Array): Awaited<ReturnType<MapshotWorkerPortal["readObjectByteRange"]>> {
	return new Response(Uint8Array.from(bytes)).body!;
}

describe("native complete local indexes with remote vector bodies", () => {
	it("startup verifies bundled file metadata once before reading immutable indexes", async () => {
		const fixture = await _installed();
		const original = BasemapIndexInstallationService.prototype.getFileSize;
		let active = 0;
		let peak = 0;
		const checked = new Set<string>();
		const fileSizes = td.replace(BasemapIndexInstallationService.prototype, "getFileSize");
		td.when(fileSizes(td.matchers.anything())).thenDo(async function (
			this: BasemapIndexInstallationService,
			params: Parameters<BasemapIndexInstallationService["getFileSize"]>[0],
		): ReturnType<BasemapIndexInstallationService["getFileSize"]> {
			active++;
			peak = Math.max(peak, active);
			try {
				await new Promise<void>((resolve) => setTimeout(resolve, 1));
				const size = await original.call(this, params);
				if (params.expectedBytes !== undefined) checked.add(params.path);
				return size;
			} finally {
				active--;
			}
		});
		await _reader({ root: fixture.root });
		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(16);
		expect(checked).toEqual(
			new Set([...getBasemapIndexFiles({ manifest: fixture.manifest }).map((file) => file.path), "landmarks.pmtiles"]),
		);
		expect(active).toBe(0);
	});

	it("rejects a bundled landmark file whose size differs from its manifest", async () => {
		const fixture = await _installed();
		await writeFile(join(fixture.root, "landmarks.pmtiles"), fixture.landmarks.bytes.subarray(0, 127));
		await expect(TileIndexService.open({ root: fixture.root })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});
	it("rejects an installed header whose tile section exceeds its pinned archive before serving", async () => {
		const fixture = await _installed();
		const header = Uint8Array.from(
			fixture.objects.get(`source/indexes/v1/${fixture.manifest.metadata.headerRoot.path}`)!,
		);
		new DataView(header.buffer).setBigUint64(56, BigInt(fixture.manifest.archive.bytes + 1), true);
		td.when(td.replace(BasemapIndexInstallationService.prototype, "readVerified")(td.matchers.anything())).thenResolve(
			header,
		);
		await expect(TileIndexService.open({ root: fixture.root })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("reads remote archive bytes through the typed Worker API", async () => {
		const fixture = await _installed();
		const readObjectByteRange = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		td.when(readObjectByteRange(td.matchers.anything())).thenResolve(_response(fixture.tile));
		const reader = await _reader({
			root: fixture.root,
			worker: _worker(readObjectByteRange),
		});
		const resource = await reader.readResource({ path: fixture.tilePath });
		expect({
			bytes: resource?.bytes,
			request: td.explain(readObjectByteRange).calls[0]?.args,
		}).toEqual({
			bytes: fixture.raw,
			request: [
				{
					key: fixture.release.pmtiles.objectKey,
					etag: fixture.release.pmtiles.etag,
					offset: fixture.tileOffset,
					length: fixture.tile.byteLength,
				},
			],
		});
	});

	it("returns byte-identical decoded tiles from the bundled indexes", async () => {
		const fixture = await _installed();
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		td.when(read(td.matchers.anything())).thenDo(
			async (
				input: Parameters<MapshotWorkerPortal["readObjectByteRange"]>[0],
			): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> => {
				expect(input).toEqual({
					key: fixture.release.pmtiles.objectKey,
					etag: fixture.release.pmtiles.etag,
					offset: fixture.tileOffset,
					length: fixture.tile.length,
				});
				return _response(fixture.tile);
			},
		);
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		const resource = await reader.readResource({ path: fixture.tilePath });
		expect(resource?.bytes).toEqual(fixture.raw);
		expect(resource?.revision).toEqual({
			id: indexFixtureSha(fixture.raw),
			path: fixture.tilePath,
		});
		expect(td.explain(read).callCount).toBe(1);
		expect(reader.identity).toEqual({
			archiveId: fixture.release.pmtiles.id,
			sha256: fixture.reference.sha256,
		});
		expect(reader.landmarkIndex).toEqual({
			path: join(fixture.root, "landmarks.pmtiles"),
			reference: fixture.manifest.landmarks,
		});
	});
	it.each([
		{ name: "negative offset", offset: -1, length: 1 },
		{ name: "fractional offset", offset: 0.5, length: 1 },
		{ name: "unsafe offset", offset: Number.MAX_SAFE_INTEGER + 1, length: 1 },
		{ name: "nonfinite offset", offset: Number.POSITIVE_INFINITY, length: 1 },
		{ name: "empty range", offset: 0, length: 0 },
		{ name: "negative length", offset: 0, length: -1 },
		{ name: "fractional length", offset: 0, length: 0.5 },
		{ name: "out-of-bounds archive range", offset: 0, length: 8 * 1024 * 1024 + 1 },
		{ name: "unsafe range end", offset: Number.MAX_SAFE_INTEGER, length: 1 },
	])("rejects a PMTiles $name before calling the Worker", async (range) => {
		const fixture = await _installed();
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		const original = PMTiles.prototype.getZxy;
		const getZxy = td.replace(PMTiles.prototype, "getZxy");
		let injected = false;
		td.when(getZxy(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
			ignoreExtraArgs: true,
		}).thenDo(async function (this: PMTiles, ...args: Parameters<PMTiles["getZxy"]>): ReturnType<PMTiles["getZxy"]> {
			if (injected) return original.apply(this, args);
			injected = true;
			await this.source.getBytes(range.offset, range.length);
			return undefined;
		});
		await expect(reader.readResource({ path: fixture.tilePath })).rejects.toMatchObject({
			errorCode: "INVALID_RESOURCE",
		});
		expect(td.explain(read).callCount).toBe(0);
	});
	it.each([Compression.None, Compression.Gzip])(
		"returns authoritative tile bytes exceeding the former eight mebibyte budget with compression %s",
		async (compression) => {
			const fixture = await _installed();
			const reader = await _reader({ root: fixture.root });
			const bytes = new Uint8Array(8 * 1024 * 1024 + 1);
			const encoded = compression === Compression.Gzip ? Uint8Array.from(gzipSync(bytes)).buffer : bytes.buffer;
			const getZxy = td.replace(PMTiles.prototype, "getZxy");
			td.when(getZxy(td.matchers.anything(), td.matchers.anything(), td.matchers.anything()), {
				ignoreExtraArgs: true,
			}).thenDo(async function (this: PMTiles): ReturnType<PMTiles["getZxy"]> {
				return { data: await this.decompress(encoded, compression) };
			});
			expect(Buffer.from((await reader.readResource({ path: fixture.tilePath })).bytes).equals(bytes)).toBe(true);
		},
	);
	it("uses the same bundle for production with different keys and ETag", async () => {
		const fixture = await _installed();
		const release = structuredClone(fixture.release);
		release.pmtiles.objectKey = "production/archive.pmtiles";
		release.pmtiles.etag = "production-etag";
		await writeFile(
			join(fixture.root, "source.json"),
			JSON.stringify({ release: release, prepared: fixture.reference }),
		);
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		td.when(read(td.matchers.anything())).thenDo(
			async (
				input: Parameters<MapshotWorkerPortal["readObjectByteRange"]>[0],
			): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> => {
				expect(input.etag).toBe("production-etag");
				return _response(fixture.tile);
			},
		);
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		expect(await reader.readSource()).toEqual(release);
		expect((await reader.readResource({ path: fixture.tilePath })).bytes).toEqual(fixture.raw);
	});

	it("returns absent tiles without network ranges and rejects retired glyph resources", async () => {
		const fixture = await _installed({ rootOnly: true });
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		const missing = await reader.readResource({
			path: `/tiles/${fixture.release.pmtiles.id}/1/0/0.mvt`,
		});
		expect(missing?.bytes).toEqual(new Uint8Array());
		expect(td.explain(read).callCount).toBe(0);
		await expect(
			reader.readResource({ path: `/glyphs/${"f".repeat(64)}/Noto%20Sans/0-255.pbf` }),
		).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});
	it("rejects a missing bundle directory before readiness", async () => {
		const root = await mkdtemp(join(tmpdir(), "maps-index-bootstrap-"));
		_roots.push(root);
		await expect(TileIndexService.open({ root: join(root, "absent") })).rejects.toMatchObject({
			errorCode: "INVALID_RESOURCE",
		});
		await expect(TileIndexService.open({ root: root })).rejects.toMatchObject({
			errorCode: "INVALID_RESOURCE",
		});
	});
	it.each(["header", "leaf"])("fails readiness for a corrupt or incomplete installed %s", async (kind) => {
		const fixture = await _installed();
		const path =
			kind === "header" ? fixture.manifest.metadata.headerRoot.path : fixture.manifest.metadata.leaves[0]!.file.path;
		if (kind === "leaf") await rm(join(fixture.root, path));
		else await writeFile(join(fixture.root, path), "corrupt");
		await expect(TileIndexService.open({ root: fixture.root })).rejects.toMatchObject({
			errorCode: kind === "header" ? AppErrorCode.BASEMAP_INDEX_INTEGRITY : AppErrorCode.INVALID_RESOURCE,
		});
	});
	it("rejects parent-directory symlinks even when they resolve inside the bundle", async () => {
		const fixture = await _installed();
		await rm(join(fixture.root, "files"), { recursive: true });
		await mkdir(join(fixture.root, "actual"));
		await symlink(join(fixture.root, "actual"), join(fixture.root, "files"));
		await expect(TileIndexService.open({ root: fixture.root })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
	});

	it("forwards cancellation options and excludes an aborted range response from the resource cache", async () => {
		const fixture = await _installed();
		const controller = new AbortController();
		let body: ReadableStreamDefaultController<Uint8Array> | undefined;
		let begun: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			begun = resolve;
		});
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		const readyResponse = _response(fixture.tile);
		let firstRead = true;
		td.when(read(td.matchers.anything())).thenDo(async (): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> => {
			if (!firstRead) return readyResponse;
			firstRead = false;
			begun?.();
			return new ReadableStream<Uint8Array>({
				start: (stream) => {
					body = stream;
				},
			});
		});
		const client = td.object<MapshotWorkerPortal>();
		client.readObjectByteRange = read;
		const worker = td.object<MapshotWorkerPortal>();
		td.when(worker.withOptions(td.matchers.anything())).thenDo((options: CallOptions): MapshotWorkerPortal => {
			expect(options.signal).toBeInstanceOf(AbortSignal);
			return client;
		});
		const reader = await _reader({ root: fixture.root, worker: worker });
		const pending = reader.readResource({
			path: fixture.tilePath,
			signal: controller.signal,
		});
		await started;
		expect(td.explain(worker.withOptions).calls.map((call) => call.args)).toEqual([
			[{ signal: expect.any(AbortSignal) }],
		]);
		controller.abort();
		const options: CallOptions | undefined = td.explain(worker.withOptions).calls[0]?.args[0];
		expect(options?.signal?.aborted).toBe(true);
		body?.error(new DOMException("Range read aborted.", "AbortError"));
		await expect(pending).rejects.toMatchObject({ errorCode: "ABORTED" });
		expect((await reader.readResource({ path: fixture.tilePath }))?.bytes).toEqual(fixture.raw);
		expect(td.explain(read).callCount).toBe(2);
	});
	it("rejects invalid resource paths and reads after close", async () => {
		const fixture = await _installed();
		const reader = await _reader({
			root: fixture.root,
			worker: _worker(td.func<MapshotWorkerPortal["readObjectByteRange"]>()),
		});
		await expect(reader.readResource({ path: "/unowned" })).rejects.toMatchObject({
			errorCode: "INVALID_RESOURCE",
		});
		await expect(reader.readResource({ path: fixture.tilePath, signal: AbortSignal.abort() })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
		await reader.close();
		await expect(reader.readResource({ path: fixture.tilePath })).rejects.toMatchObject({
			errorCode: "RESOURCE_UNAVAILABLE",
		});
	});
	it("reads a compressed leaf spanning two installed chunks", async () => {
		const fixture = await _installed({ splitLeaf: true });
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		td.when(read(td.matchers.anything())).thenResolve(_response(fixture.tile));
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		expect((await reader.readResource({ path: fixture.tilePath }))?.bytes).toEqual(fixture.raw);
	});
	it.each(["leaf-gap", "leaf-missing", "header-size"])(
		"rejects internally hashed but incomplete %s metadata",
		async (kind) => {
			const fixture = await _installed();
			const manifest = structuredClone(fixture.manifest);
			if (kind === "leaf-gap") manifest.metadata.leaves[0]!.originalOffset++;
			if (kind === "leaf-missing") manifest.metadata.leaves = [];
			if (kind === "header-size") {
				const original = fixture.objects.get(`source/indexes/v1/${manifest.metadata.headerRoot.path}`)!;
				const bytes = new Uint8Array(original.length + 1);
				bytes.set(original);
				const sha = indexFixtureSha(bytes);
				manifest.metadata.headerRoot = { path: `files/${sha}.body`, sha256: sha, bytes: bytes.length };
				await writeFile(join(fixture.root, manifest.metadata.headerRoot.path), bytes);
			}
			await writeFile(join(fixture.root, "manifest.json"), JSON.stringify(manifest));
			await expect(TileIndexService.open({ root: fixture.root })).rejects.toMatchObject({
				errorCode: "INVALID_RESOURCE",
			});
		},
	);
	it("rejects an installed root symlink or regular file and an already cancelled installation", async () => {
		const fixture = await _installed();
		const parent = await mkdtemp(join(tmpdir(), "maps-index-root-"));
		_roots.push(parent);
		await symlink(fixture.root, join(parent, "link"));
		await writeFile(join(parent, "file"), "file");
		await expect(TileIndexService.open({ root: join(parent, "link") })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
		await expect(TileIndexService.open({ root: join(parent, "file") })).rejects.toMatchObject({
			errorCode: AppErrorCode.BASEMAP_INDEX_INTEGRITY,
		});
		await expect(TileIndexService.open({ root: fixture.root, signal: AbortSignal.abort() })).rejects.toMatchObject({
			errorCode: "ABORTED",
		});
	});
	it("rejects unauthorized paths before reading tile bodies", async () => {
		const fixture = await _installed();
		const reader = await _reader({
			root: fixture.root,
			worker: _worker(td.func<MapshotWorkerPortal["readObjectByteRange"]>()),
		});
		await expect(
			reader.readResource({
				path: fixture.tilePath.replace(fixture.release.pmtiles.id, "f".repeat(64)),
			}),
		).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
		await expect(
			reader.readResource({ path: fixture.tilePath.replace("/0/0/0.mvt", "/2/0/0.mvt") }),
		).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});
	it.each(["network", "cancelled-network", "stream"])(
		"handles %s failures without returning partial tile bytes",
		async (kind) => {
			const fixture = await _installed();
			const controller = new AbortController();
			const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
			td.when(read(td.matchers.anything())).thenDo(async (): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> => {
				if (kind === "cancelled-network") controller.abort();
				if (kind === "network" || kind === "cancelled-network") throw new Error("Connection failed");
				return new ReadableStream<Uint8Array>({
					start(stream) {
						stream.error(new Error("Partial stream failed"));
					},
				});
			});
			const reader = await _reader({ root: fixture.root, worker: _worker(read) });
			await expect(reader.readResource({ path: fixture.tilePath, signal: controller.signal })).rejects.toMatchObject({
				errorCode: kind === "cancelled-network" ? "ABORTED" : "RESOURCE_UNAVAILABLE",
			});
		},
	);
	it("reads a planet whose leaf directory follows its tile data", async () => {
		const fixture = await _installed({ leavesAfterTiles: true });
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		td.when(read(td.matchers.anything())).thenResolve(_response(fixture.tile));
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		expect((await reader.readResource({ path: fixture.tilePath }))?.bytes).toEqual(fixture.raw);
	});
});

describe("bundled rendering source", () => {
	it("opens verified indexes for data preparation before a rendering source is installed", async () => {
		const fixture = await _installed();
		await rm(join(fixture.root, "source.json"));
		const reader = await _reader({ root: fixture.root });
		expect(reader.identity).toEqual({ archiveId: fixture.release.pmtiles.id, sha256: fixture.reference.sha256 });
	});
	it("pins the source paired with the installed indexes through one shared read without an R2 request", async () => {
		const fixture = await _installed();
		const read = td.func<MapshotWorkerPortal["readObjectByteRange"]>();
		const reader = await _reader({ root: fixture.root, worker: _worker(read) });
		const pending = reader.readSource();
		expect(reader.readSource()).toBe(pending);
		const source = await pending;
		expect(source).toEqual(fixture.release);
		await writeFile(join(fixture.root, "source.json"), "changed after activation");
		expect(await reader.readSource()).toBe(source);
		expect(td.explain(read).callCount).toBe(0);
	});
	it.each([
		"missing",
		"json",
		"schema",
		"manifest",
		"archive",
		"bytes",
		"algorithm",
		"minZoom",
		"maxZoom",
		"references",
		"catalogue",
	])("rejects %s source configuration before startup becomes ready", async (failure) => {
		const fixture = await _installed();
		const source = { release: structuredClone(fixture.release), prepared: { ...fixture.reference } };
		if (failure === "manifest") {
			source.prepared.sha256 = "d".repeat(64);
			source.prepared.manifestKey = `source/indexes/v1/${source.prepared.archiveId}/${source.prepared.sha256}/manifest.json`;
		}
		if (failure === "archive") {
			source.release.pmtiles.id = "d".repeat(64);
			source.release.pmtiles.digest.value = "d".repeat(64);
			source.prepared.archiveId = "d".repeat(64);
			source.prepared.manifestKey = `source/indexes/v1/${source.prepared.archiveId}/${source.prepared.sha256}/manifest.json`;
		}
		if (failure === "bytes") source.release.pmtiles.bytes += 1;
		if (failure === "algorithm") source.release.pmtiles.digest.algorithm = "blake3";
		if (failure === "minZoom") source.release.pmtiles.minZoom = 1;
		if (failure === "maxZoom") source.release.pmtiles.maxZoom = 2;
		if (failure === "references") source.release.references.id = "d".repeat(64);
		if (failure === "catalogue") source.release.references.catalogueKey = "private/wrong.pmtiles";
		if (failure === "missing") await rm(join(fixture.root, "source.json"));
		else
			await writeFile(
				join(fixture.root, "source.json"),
				failure === "json" ? "private malformed data" : failure === "schema" ? "{}" : JSON.stringify(source),
			);
		const reader = await _reader({ root: fixture.root });
		await expect(reader.readSource()).rejects.toMatchObject({ errorCode: "INVALID_RESOURCE" });
	});
});
