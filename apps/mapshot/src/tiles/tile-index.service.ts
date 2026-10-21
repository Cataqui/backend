import {
	AppError,
	RenderingAbortedError,
	InvalidRenderingResourceError,
	RenderingResourceUnavailableError,
} from "../errors/index";
import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import type { BasemapResourceRevision } from "./schemas/basemap-resource-revision.schema";
import type { BasemapSourceRelease } from "./sources/schemas/basemap-source-release.schema";
import { parseStoredBasemapResourcePath } from "./schemas/stored-basemap-resource-path.schema";
import { PmtilesDirectoryCache } from "./pmtiles/pmtiles-directory-cache";
import { BasemapIndexInstallationService } from "./indexes/basemap-index-installation.service";
import { getBasemapIndexFiles, readBasemapIndexHeader } from "./sources/indexes/basemap-index-manifest";
import {
	BasemapIndexManifestSchema,
	type BasemapIndexManifest,
} from "./sources/indexes/schemas/basemap-index-manifest.schema";
import { BasemapSourceCandidateSchema } from "./sources/schemas/basemap-source-candidate.schema";
import type { PackedLandmarkIndexReference } from "../landmark/index/schemas/packed-landmark-index-reference.schema";
import { TileIndexRepository } from "./tile-index.repository";

export class TileIndexService {
	readonly identity: { archiveId: string; sha256: string };
	readonly landmarkIndex: { path: string; reference: PackedLandmarkIndexReference };
	private readonly _directories = new PmtilesDirectoryCache({
		maximumEntries: 4,
		maximumDecodedEntries: 131072,
	});
	private readonly _active = new Set<Promise<{ bytes: Uint8Array; revision: BasemapResourceRevision }>>();
	private _source: Promise<BasemapSourceRelease> | undefined;
	private _closed = false;
	private readonly _installation;
	private readonly _manifest;
	private readonly _header;
	private readonly _archiveHeader;
	private readonly _repository;
	static async open(
		params: { worker?: MapshotWorkerPortal | undefined; root?: string; signal?: AbortSignal | undefined } = {},
	): Promise<TileIndexService> {
		if (params.signal?.aborted) throw new RenderingAbortedError();
		const requested = resolve(params.root ?? "/app/data/indexes");
		try {
			const installation = await BasemapIndexInstallationService.open({ root: requested });
			const bytes = await installation.read({
				path: "manifest.json",
				signal: params.signal,
			});
			const manifest = BasemapIndexManifestSchema.parse(
				JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)),
			);
			const sha256 = createHash("sha256").update(bytes).digest("hex");
			const files = getBasemapIndexFiles({ manifest: manifest });
			// Trusted image packaging verifies complete bytes once. Startup checks immutable file metadata.
			for (let offset = 0; offset < files.length; offset += 16) {
				await Promise.all(
					files.slice(offset, offset + 16).map(async (file) => {
						params.signal?.throwIfAborted();
						await installation.getFileSize({ path: file.path, expectedBytes: file.bytes });
					}),
				);
			}
			await installation.getFileSize({
				path: "landmarks.pmtiles",
				expectedBytes: manifest.landmarks.bytes,
			});
			const header = await installation.readVerified({ file: manifest.metadata.headerRoot, signal: params.signal });
			const parsed = readBasemapIndexHeader({ bytes: header, archive: manifest.archive });
			if (manifest.metadata.headerRoot.bytes !== parsed.rootDirectoryOffset + parsed.rootDirectoryLength)
				throw new InvalidRenderingResourceError();
			let end = parsed.leafDirectoryOffset;
			for (const leaf of manifest.metadata.leaves) {
				if (leaf.originalOffset !== end) throw new InvalidRenderingResourceError();
				end += leaf.file.bytes;
			}
			if (end !== parsed.leafDirectoryOffset + parsed.leafDirectoryLength) throw new InvalidRenderingResourceError();
			params.signal?.throwIfAborted();
			const reader = new TileIndexService({
				installation: installation,
				manifest: manifest,
				header: header,
				archiveHeader: parsed,
				identity: { archiveId: manifest.archive.id, sha256: sha256 },
				landmarkIndex: { path: resolve(requested, "landmarks.pmtiles"), reference: manifest.landmarks },
				worker: params.worker,
			});
			const readinessSignal = params.signal ?? new AbortController().signal;
			const source: Source & { operationSignal: AbortSignal } = {
				operationSignal: readinessSignal,
				getKey: () => `local-index-readiness:${reader.identity.sha256}`,
				getBytes: async (offset, length) => {
					readinessSignal.throwIfAborted();
					if (offset !== 0 || length !== 16384) throw new InvalidRenderingResourceError();
					const bytes = new Uint8Array(16384);
					bytes.set(reader._header);
					return { data: bytes.buffer };
				},
			};
			const rootHeader = await reader._directories.getHeader(source);
			await reader._directories.getDirectory(
				source,
				rootHeader.rootDirectoryOffset,
				rootHeader.rootDirectoryLength,
				rootHeader,
			);
			return reader;
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw params.signal?.aborted ? new RenderingAbortedError() : new InvalidRenderingResourceError();
		}
	}
	private constructor(params: {
		installation: BasemapIndexInstallationService;
		manifest: BasemapIndexManifest;
		header: Uint8Array;
		archiveHeader: ReturnType<typeof readBasemapIndexHeader>;
		identity: { archiveId: string; sha256: string };
		landmarkIndex: { path: string; reference: PackedLandmarkIndexReference };
		worker?: MapshotWorkerPortal | undefined;
	}) {
		this.identity = params.identity;
		this.landmarkIndex = params.landmarkIndex;
		this._installation = params.installation;
		this._manifest = params.manifest;
		this._header = params.header;
		this._archiveHeader = params.archiveHeader;
		this._repository = params.worker === undefined ? undefined : new TileIndexRepository({ worker: params.worker });
	}

	readSource(): Promise<BasemapSourceRelease> {
		this._source ??= (async (): Promise<BasemapSourceRelease> => {
			try {
				const bytes = await this._installation.read({ path: "source.json" });
				const candidate = BasemapSourceCandidateSchema.parse(
					JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
				);
				const archive = candidate.release.pmtiles;
				const references = candidate.release.references;
				const manifest = this._manifest;
				if (
					candidate.prepared.sha256 !== this.identity.sha256 ||
					archive.id !== manifest.archive.id ||
					archive.bytes !== manifest.archive.bytes ||
					archive.digest.algorithm !== manifest.archive.digest.algorithm ||
					archive.minZoom !== manifest.archive.minZoom ||
					archive.maxZoom !== manifest.archive.maxZoom ||
					references.id !== manifest.landmarks.sha256 ||
					references.catalogueKey !== manifest.landmarks.key
				)
					throw new InvalidRenderingResourceError();
				return candidate.release;
			} catch (error) {
				if (error instanceof AppError) throw error;
				throw new InvalidRenderingResourceError();
			}
		})();
		return this._source;
	}

	async readResource(params: {
		path: string;
		signal?: AbortSignal | undefined;
	}): Promise<{ bytes: Uint8Array; revision: BasemapResourceRevision }> {
		if (this._closed) throw new RenderingResourceUnavailableError();
		const operation = (async (): Promise<{ bytes: Uint8Array; revision: BasemapResourceRevision }> => {
			const signal = params.signal ?? new AbortController().signal;
			if (signal.aborted) throw new RenderingAbortedError();
			const release = await this.readSource();
			const location = parseStoredBasemapResourcePath({ path: params.path });
			if (location === null || location.id !== release.pmtiles.id) throw new InvalidRenderingResourceError();
			const manifest = this._manifest;
			if (location.z < manifest.archive.minZoom || location.z > manifest.archive.maxZoom)
				throw new InvalidRenderingResourceError();
			const source: Source & { operationSignal: AbortSignal } = {
				operationSignal: signal,
				getKey: () => `local-index:${release.pmtiles.id}:${release.pmtiles.etag}`,
				getBytes: async (offset, length, readSignal, etag) => {
					const operationSignal = readSignal === undefined ? signal : AbortSignal.any([signal, readSignal]);
					operationSignal.throwIfAborted();
					if (etag !== undefined && etag !== release.pmtiles.etag) throw new InvalidRenderingResourceError();
					const archive = release.pmtiles;
					if (
						!Number.isSafeInteger(offset) ||
						!Number.isSafeInteger(length) ||
						offset < 0 ||
						length < 1 ||
						!Number.isSafeInteger(offset + length) ||
						offset + length > archive.bytes
					)
						throw new InvalidRenderingResourceError();
					let bytes: Uint8Array;
					if (offset === 0 && length === 16384) {
						bytes = new Uint8Array(16384);
						bytes.set(this._header);
					} else if (offset + length <= this._header.length) {
						bytes = this._header.slice(offset, offset + length);
					} else {
						const leaves = this._manifest.metadata.leaves;
						const first = leaves[0];
						const last = leaves.at(-1);
						if (
							first !== undefined &&
							last !== undefined &&
							offset >= first.originalOffset &&
							offset + length <= last.originalOffset + last.file.bytes
						) {
							bytes = new Uint8Array(length);
							let at = 0;
							for (const leaf of leaves) {
								const position = offset + at;
								if (position < leaf.originalOffset || position >= leaf.originalOffset + leaf.file.bytes) continue;
								const count = Math.min(length - at, leaf.originalOffset + leaf.file.bytes - position);
								bytes.set(
									await this._installation.read({
										path: leaf.file.path,
										expectedBytes: leaf.file.bytes,
										offset: position - leaf.originalOffset,
										length: count,
										signal: operationSignal,
									}),
									at,
								);
								at += count;
								if (at === bytes.length) break;
							}
							if (at !== bytes.length) throw new InvalidRenderingResourceError();
						} else {
							const header = this._archiveHeader;
							if (offset < header.tileDataOffset || offset + length > header.tileDataOffset + header.tileDataLength)
								throw new InvalidRenderingResourceError();
							if (this._repository === undefined) throw new RenderingResourceUnavailableError();
							try {
								const resource = await this._repository.readObjectByteRange({
									key: archive.objectKey,
									etag: archive.etag,
									offset: offset,
									length: length,
									signal: operationSignal,
								});
								bytes = new Uint8Array(await new Response(resource).arrayBuffer());
								operationSignal.throwIfAborted();
							} catch (error) {
								if (error instanceof AppError) throw error;
								throw operationSignal.aborted ? new RenderingAbortedError() : new RenderingResourceUnavailableError();
							}
						}
					}
					operationSignal.throwIfAborted();
					return { data: Uint8Array.from(bytes).buffer, etag: release.pmtiles.etag } satisfies RangeResponse;
				},
			};
			try {
				const archive = new PMTiles(source, this._directories, (bytes, compression) =>
					this._directories.decompressResource({
						bytes: bytes,
						compression: compression,
					}),
				);
				const result = await archive.getZxy(location.z, location.x, location.y, signal);
				signal.throwIfAborted();
				const bytes = result === undefined ? new Uint8Array() : new Uint8Array(result.data);
				return {
					bytes: bytes,
					revision: {
						id: createHash("sha256").update(bytes).digest("hex"),
						path: params.path,
					},
				};
			} catch (error) {
				if (error instanceof AppError) throw error;
				throw signal.aborted ? new RenderingAbortedError() : new InvalidRenderingResourceError();
			}
		})();
		this._active.add(operation);
		try {
			return await operation;
		} finally {
			this._active.delete(operation);
		}
	}

	async close(): Promise<void> {
		this._closed = true;
		await Promise.allSettled(this._active);
	}
}
