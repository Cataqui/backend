import { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { Compression, tileIdToZxy, zxyToTileId, type Entry } from "pmtiles";
import { PackedLandmarkColumns } from "../../../../src/landmark/index/packed-landmark-format";
import type { PackedLandmarkIndexMetadata } from "../../../../src/landmark/index/schemas/packed-landmark-index-metadata.schema";
import {
	PackedLandmarkRowSchema,
	type PackedLandmarkRow,
} from "../../../../src/landmark/index/schemas/packed-landmark-row.schema";
import { ReferenceImportError } from "../reference-import.error";
import { WorldwideIndexRepository } from "./worldwide-index.repository";
import type { WorldwidePointSpoolRow } from "./schemas/worldwide-point-spool-row.schema";

export type { WorldwidePointSpoolRow };

export interface WorldwidePointSpoolManifest {
	files: { path: string; bytes: number; lines: number; sha256: string }[];
}

export interface WorldwideIndexBuildInput {
	spool: WorldwidePointSpoolManifest;
	aliasesPath: string | null;
	directory: string;
	signal?: AbortSignal;
}

export interface WorldwideIndexBuildOutput {
	path: string;
	bytes: number;
	sha256: string;
}

export class WorldwideIndexService {
	private readonly _repository = new WorldwideIndexRepository();
	async build(params: WorldwideIndexBuildInput): Promise<WorldwideIndexBuildOutput> {
		const spool = params.spool;
		this._repository.mkdir(params.directory);
		const databasePath = join(params.directory, "staging.sqlite");
		const payloadPath = join(params.directory, "payload.bin");
		const pendingPath = join(params.directory, "landmarks.pmtiles.partial");
		const path = join(params.directory, "landmarks.pmtiles");
		const generatedPaths = [databasePath, payloadPath, pendingPath, path];
		if (generatedPaths.some((entry) => this._repository.exists(entry)))
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.STAGING_CONFLICT });
		params.signal?.throwIfAborted();
		const database = this._repository.openDatabase(databasePath);
		try {
			// MEMORY is supported with Node's SQLite defensive mode. Small committed batches bound its rollback journal.
			database.exec(`PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; PRAGMA cache_size=-65536;
				CREATE TABLE canonical(key TEXT PRIMARY KEY,source_tile INTEGER NOT NULL,ordinal INTEGER NOT NULL,nominal INTEGER NOT NULL,lon REAL NOT NULL,lat REAL NOT NULL,shard INTEGER NOT NULL,row TEXT NOT NULL) WITHOUT ROWID;
				CREATE TABLE shared(content_offset INTEGER NOT NULL,ordinal INTEGER NOT NULL,row TEXT NOT NULL,PRIMARY KEY(content_offset,ordinal)) WITHOUT ROWID;
				CREATE TABLE alias_seen(content_offset INTEGER NOT NULL,tile_id INTEGER NOT NULL,run_length INTEGER NOT NULL,PRIMARY KEY(content_offset,tile_id)) WITHOUT ROWID;`);
			const insert =
				database.prepare(`INSERT INTO canonical(key,source_tile,ordinal,nominal,lon,lat,shard,row) VALUES(?,?,?,?,?,?,?,?)
				ON CONFLICT(key) DO UPDATE SET source_tile=excluded.source_tile,ordinal=excluded.ordinal,nominal=excluded.nominal,lon=excluded.lon,lat=excluded.lat,shard=excluded.shard,row=excluded.row
				WHERE excluded.nominal>canonical.nominal OR (excluded.nominal=canonical.nominal AND (excluded.source_tile<canonical.source_tile OR (excluded.source_tile=canonical.source_tile AND excluded.ordinal<canonical.ordinal)))`);
			const existing = database.prepare("SELECT lon,lat FROM canonical WHERE key=?");
			let operations = 0;
			const admit = (input: { row: WorldwidePointSpoolRow; tileId: number }): void => {
				const row = input.row;
				const tileId = input.tileId;
				const [zoom, x, y] = tileIdToZxy(tileId);
				const size = 2 ** zoom;
				const longitude = this._wrap({ longitude: ((x + row[11]) / size) * 360 - 180 });
				const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + row[12])) / size))) * 180) / Math.PI;
				const withinMercatorProjection = PackedLandmarkRowSchema.def.items[6].safeParse(latitude).success;
				if (!withinMercatorProjection) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
				const compact = [
					row[4],
					row[6],
					row[7],
					row[5],
					row[8],
					longitude,
					latitude,
					row[9],
					row[10],
				] satisfies PackedLandmarkRow;
				const key = `pois:${row[5]}:${row[4]}`;
				const prior = existing.get(key);
				const conflictingSourceCoordinates =
					prior !== undefined &&
					(Math.abs(this._wrap({ longitude: longitude - Number(prior["lon"]) })) > 1e-9 ||
						Math.abs(latitude - Number(prior["lat"])) > 1e-9);
				if (conflictingSourceCoordinates) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
				const owner = this._cell({ longitude: longitude, latitude: latitude, zoom: 15 });
				const shard = this._cell({ longitude: longitude, latitude: latitude, zoom: 13 });
				const sourceTileOwnsPoint = owner.x === x && owner.y === y;
				insert.run(
					key,
					tileId,
					row[3],
					sourceTileOwnsPoint ? 1 : 0,
					longitude,
					latitude,
					zxyToTileId(13, shard.x, shard.y),
					JSON.stringify(compact),
				);
				if ((++operations & 8191) === 0) params.signal?.throwIfAborted();
			};
			const putShared = database.prepare("INSERT INTO shared(content_offset,ordinal,row) VALUES(?,?,?)");
			let physical = 0,
				transactionBytes = 0;
			database.exec("BEGIN");
			for (const file of spool.files) {
				if (this._repository.stat(file.path).size !== file.bytes)
					throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
				const hash = createHash("sha256");
				let bytes = 0,
					lines = 0;
				const input = this._repository.readStream(file.path);
				const decoder = new TextDecoder("utf8", { fatal: true });
				let parts: Buffer[] = [],
					pending = 0;
				for await (const chunk of input) {
					hash.update(chunk);
					const chunkBytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
					let start = 0;
					for (;;) {
						const end = chunkBytes.indexOf(10, start);
						if (end < 0) break;
						const part = chunkBytes.subarray(start, end);
						const size = pending + part.length;
						const data = parts.length === 0 ? part : Buffer.concat([...parts, part], size);
						let line: string;
						try {
							line = decoder.decode(data);
						} catch {
							throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
						}
						const row = this._row({ line: line });
						bytes += size + 1;
						transactionBytes += size + 1;
						lines++;
						physical++;
						if (row[1] === 1) admit({ row: row, tileId: row[2] });
						else putShared.run(row[0], row[3], line);
						const transactionNeedsCommit = physical % 10000 === 0 || transactionBytes >= 8 * 1024 * 1024;
						if (transactionNeedsCommit) {
							database.exec("COMMIT; BEGIN");
							transactionBytes = 0;
							params.signal?.throwIfAborted();
						}
						parts = [];
						pending = 0;
						start = end + 1;
					}
					if (start < chunkBytes.length) {
						const part = chunkBytes.subarray(start);
						pending += part.length;
						parts.push(part);
					}
				}
				if (pending !== 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
				if (bytes !== file.bytes || lines !== file.lines || hash.digest("hex") !== file.sha256)
					throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
				params.signal?.throwIfAborted();
			}
			database.exec("COMMIT");
			if (params.aliasesPath !== null) {
				const getShared = database.prepare("SELECT 1 FROM shared WHERE content_offset=? LIMIT 1");
				const seen = database.prepare("INSERT INTO alias_seen(content_offset,tile_id,run_length) VALUES(?,?,?)");
				const fd = this._repository.open(params.aliasesPath, "r");
				try {
					const buffer = Buffer.alloc(1024 * 1024);
					let offset = 0,
						intervals = 0;
					database.exec("BEGIN");
					for (;;) {
						const bytes = this._repository.read(fd, buffer, 0, buffer.length, offset);
						if (bytes === 0) break;
						if (bytes % 16 !== 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
						for (let at = 0; at < bytes; at += 16) {
							const contentOffset = Number(buffer.readBigUInt64LE(at));
							const tileId = buffer.readUInt32LE(at + 8),
								runLength = buffer.readUInt32LE(at + 12);
							if (getShared.get(contentOffset)) {
								seen.run(contentOffset, tileId, runLength);
							}
							if ((++intervals & 1023) === 0) {
								database.exec("COMMIT; BEGIN");
								params.signal?.throwIfAborted();
							}
						}
						offset += bytes;
					}
					database.exec("COMMIT");
				} finally {
					this._repository.close(fd);
				}
			}
			for (const value of database
				.prepare(
					"SELECT shared.row,alias_seen.tile_id,alias_seen.run_length FROM alias_seen JOIN shared USING(content_offset) ORDER BY alias_seen.content_offset,alias_seen.tile_id,shared.ordinal",
				)
				.iterate()) {
				const row = this._row({ line: String(value["row"]) });
				const tileId = Number(value["tile_id"]),
					runLength = Number(value["run_length"]);
				for (let step = 0; step < runLength; step++) {
					admit({ row: row, tileId: tileId + step });
				}
			}
			database.exec("CREATE INDEX canonical_shards ON canonical(shard,key)");
			const records = Number(database.prepare("SELECT count(*) AS n FROM canonical").get()?.["n"]);
			if (records === 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE });
			const entries: Entry[] = [];
			{
				const fd = this._repository.open(payloadPath, "wx");
				try {
					let current: number | undefined,
						rows: string[] = [],
						offset = 0;
					const flush = (): void => {
						if (current === undefined) return;
						const bytes = gzipSync(Buffer.from(`[${rows.join(",")}]`));
						entries.push({ tileId: current, runLength: 1, offset: offset, length: bytes.length });
						this._write({ fd: fd, bytes: bytes });
						offset += bytes.length;
						rows = [];
						if ((entries.length & 1023) === 0) params.signal?.throwIfAborted();
					};
					for (const value of database.prepare("SELECT shard,row FROM canonical ORDER BY shard,key").iterate()) {
						const shard = Number(value["shard"]),
							row = String(value["row"]);
						if (current !== shard) {
							flush();
							current = shard;
							if (entries.length > 0 && (entries.length & 1023) === 0) {
								await setImmediate();
								params.signal?.throwIfAborted();
							}
						}
						rows.push(row);
					}
					flush();
				} finally {
					this._repository.close(fd);
				}
			}
			const metadata = {
				schemaVersion: 1,
				format: "mapshot-landmark-points-v1",
				coverage: "worldwide-source-zoom-15",
				sourceZoom: 15,
				indexZoom: 13,
				columns: [...PackedLandmarkColumns],
				records: records,
				cells: entries.length,
			} satisfies PackedLandmarkIndexMetadata;
			{
				const leaves: Buffer[] = [],
					rootEntries: Entry[] = [];
				let leafBytes = 0;
				for (let index = 0; index < entries.length; index += 2000) {
					const chunkEntries = entries.slice(index, index + 2000);
					const first = entries[index]!;
					const bytes = this._directory({ entries: chunkEntries });
					leaves.push(bytes);
					rootEntries.push({ tileId: first.tileId, runLength: 0, offset: leafBytes, length: bytes.length });
					leafBytes += bytes.length;
				}
				const root = this._directory({ entries: rootEntries });
				if (root.length > 16384 - 127) throw new ReferenceImportError({ code: ReferenceImportErrorCode.CAPACITY });
				const metadataBytes = gzipSync(Buffer.from(JSON.stringify(metadata)));
				const metadataOffset = 127 + root.length,
					leavesOffset = metadataOffset + metadataBytes.length;
				const dataOffset = Math.max(16384, leavesOffset + leafBytes),
					payloadBytes = this._repository.stat(payloadPath).size;
				const header = Buffer.alloc(127);
				header.write("PMTiles", 0, "ascii");
				header[7] = 3;
				for (const [offset, value] of [
					[8, 127],
					[16, root.length],
					[24, metadataOffset],
					[32, metadataBytes.length],
					[40, leavesOffset],
					[48, leafBytes],
					[56, dataOffset],
					[64, payloadBytes],
					[72, entries.length],
					[80, entries.length],
					[88, entries.length],
				] as const)
					header.writeBigUInt64LE(BigInt(value), offset);
				header[96] = 1;
				header[97] = Compression.Gzip;
				header[98] = Compression.Gzip;
				header[99] = 0;
				header[100] = 13;
				header[101] = 13;
				for (const [offset, value] of [
					[102, -180],
					[106, -85.0511287],
					[110, 180],
					[114, 85.0511287],
				] as const)
					header.writeInt32LE(Math.round(value * 1e7), offset);
				header[118] = 13;
				const fd = this._repository.open(pendingPath, "wx"),
					payload = this._repository.open(payloadPath, "r");
				try {
					this._write({ fd: fd, bytes: header });
					this._write({ fd: fd, bytes: root });
					this._write({ fd: fd, bytes: metadataBytes });
					for (const leaf of leaves) this._write({ fd: fd, bytes: leaf });
					this._write({ fd: fd, bytes: Buffer.alloc(dataOffset - leavesOffset - leafBytes) });
					const buffer = Buffer.alloc(1024 * 1024);
					let offset = 0;
					for (;;) {
						const bytes = this._repository.read(payload, buffer, 0, buffer.length, offset);
						if (bytes === 0) break;
						this._write({ fd: fd, bytes: buffer.subarray(0, bytes) });
						offset += bytes;
						params.signal?.throwIfAborted();
					}
				} finally {
					this._repository.close(payload);
					this._repository.close(fd);
				}
			}
			const hash = createHash("sha256");
			for await (const bytes of this._repository.readStream(pendingPath)) {
				hash.update(bytes);
				params.signal?.throwIfAborted();
			}
			params.signal?.throwIfAborted();
			this._repository.rename(pendingPath, path);
			return {
				path: path,
				bytes: this._repository.stat(path).size,
				sha256: hash.digest("hex"),
			};
		} finally {
			database.close();
		}
	}

	private _directory(params: { entries: Entry[] }): Buffer {
		const buffers = [this._varint({ value: params.entries.length })];
		let previous = 0;
		for (const entry of params.entries) {
			buffers.push(this._varint({ value: entry.tileId - previous }));
			previous = entry.tileId;
		}
		for (const entry of params.entries) buffers.push(this._varint({ value: entry.runLength }));
		for (const entry of params.entries) buffers.push(this._varint({ value: entry.length }));
		for (const [index, entry] of params.entries.entries()) {
			const prior = params.entries[index - 1];
			const followsPreviousContent = prior !== undefined && entry.offset === prior.offset + prior.length;
			buffers.push(this._varint({ value: followsPreviousContent ? 0 : entry.offset + 1 }));
		}
		return gzipSync(Buffer.concat(buffers));
	}

	private _varint(params: { value: number }): Buffer {
		let value = params.value;
		const result: number[] = [];
		do {
			const rest = Math.floor(value / 128);
			result.push((value % 128) | (rest === 0 ? 0 : 128));
			value = rest;
		} while (value > 0);
		return Buffer.from(result);
	}

	private _row(params: { line: string }): WorldwidePointSpoolRow {
		try {
			return JSON.parse(params.line);
		} catch {
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
		}
	}

	private _wrap(params: { longitude: number }): number {
		return ((((params.longitude + 180) % 360) + 360) % 360) - 180;
	}

	private _cell(params: { longitude: number; latitude: number; zoom: number }): { x: number; y: number } {
		const size = 2 ** params.zoom;
		return {
			x: Math.min(size - 1, Math.max(0, Math.floor(((params.longitude + 180) / 360) * size))),
			y: Math.min(
				size - 1,
				Math.max(0, Math.floor(((1 - Math.asinh(Math.tan((params.latitude * Math.PI) / 180)) / Math.PI) / 2) * size)),
			),
		};
	}

	private _write(params: { fd: number; bytes: Uint8Array }): void {
		let completed = 0;
		while (completed < params.bytes.byteLength) {
			const written = this._repository.write(params.fd, params.bytes, completed, params.bytes.byteLength - completed);
			if (written === 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
			completed += written;
		}
	}
}
