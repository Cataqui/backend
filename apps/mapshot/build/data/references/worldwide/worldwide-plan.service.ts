import { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";
import { join } from "node:path";
import type { StatementSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { setImmediate } from "node:timers/promises";
import { bytesToHeader, Compression, readVarint, TileType, type Entry, type Header } from "pmtiles";
import { ReferenceImportError } from "../reference-import.error";
import { WorldwidePlanRepository } from "./worldwide-plan.repository";

type _Archive = { bytes: number; read(params: { offset: number; length: number }): Promise<Uint8Array> };

/*
 * Builds a physically ordered, disk-backed plan without retaining planet-sized directory arrays.
 * Members are 24-byte little-endian records: absolute offset u64, gzip length u32,
 * representative tile ID u32, addressed multiplicity u32, reserved zero u32.
 * Aliases are 16-byte records: absolute offset u64, tile ID u32, run length u32.
 * Every selected run for a repeated physical content appears in aliases, including its first run.
 */
export class WorldwidePlanService {
	private readonly _repository = new WorldwidePlanRepository();

	async prepare(params: { archive: _Archive; directory: string; signal?: AbortSignal }): Promise<{
		membersPath: string;
		aliasesPath: string;
	}> {
		params.signal?.throwIfAborted();
		this._repository.createDirectory({ path: params.directory });
		const databasePath = join(params.directory, "worldwide-plan.sqlite");
		const databaseFiles = [databasePath, `${databasePath}-journal`];
		const membersPath = join(params.directory, "members.bin");
		const aliasesPath = join(params.directory, "aliases.bin");
		for (const path of [...databaseFiles, membersPath, aliasesPath]) this._repository.removeFile({ path: path });
		const db = this._repository.openDatabase({ path: databasePath });
		let success = false;
		try {
			this._repository.execute({
				database: db,
				sql: `PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; PRAGMA cache_size=-32768;
				CREATE TABLE contents(offset INTEGER PRIMARY KEY,length INTEGER NOT NULL,tile_id INTEGER NOT NULL,multiplicity INTEGER NOT NULL) WITHOUT ROWID;
				CREATE TABLE aliases(offset INTEGER,tile_id INTEGER,run_length INTEGER NOT NULL,PRIMARY KEY(offset,tile_id)) WITHOUT ROWID;
				CREATE TABLE directories(offset INTEGER PRIMARY KEY,length INTEGER NOT NULL) WITHOUT ROWID; BEGIN`,
			});
			const headerBytes = await this._read({ archive: params.archive, offset: 0, length: 127, signal: params.signal });
			if (Buffer.from(headerBytes.subarray(0, 7)).toString("ascii") !== "PMTiles" || headerBytes[7] !== 3)
				throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			const header = bytesToHeader(Uint8Array.from(headerBytes).buffer);
			if (
				!header.clustered ||
				header.tileType !== TileType.Mvt ||
				header.tileCompression !== Compression.Gzip ||
				![Compression.None, Compression.Gzip].includes(header.internalCompression) ||
				header.minZoom > 15 ||
				header.maxZoom < 15 ||
				header.maxZoom > 26
			)
				throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			for (const count of [header.numAddressedTiles, header.numTileContents, header.numTileEntries])
				this._number(count);
			let end = 127;
			const regions: [number, number][] = [
				[header.rootDirectoryOffset, header.rootDirectoryLength],
				[header.jsonMetadataOffset, header.jsonMetadataLength],
				[header.leafDirectoryOffset, header.leafDirectoryLength ?? 0],
				[header.tileDataOffset, header.tileDataLength ?? 0],
			];
			for (const [offset, length] of regions.sort((left, right) => left[0] - right[0])) {
				if (length === 0) continue;
				this._range({ offset: offset, length: length, bytes: params.archive.bytes });
				if (offset < end) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
				end = offset + length;
			}
			const leafLength = this._number(header.leafDirectoryLength);
			let leafSlab: { offset: number; bytes: Uint8Array } | undefined;
			const leafArchive: _Archive = {
				bytes: params.archive.bytes,
				read: async (range) => {
					this._range({
						offset: range.offset - header.leafDirectoryOffset,
						length: range.length,
						bytes: leafLength,
					});
					const prefetched = leafSlab;
					const directoryIsPrefetched =
						prefetched !== undefined &&
						range.offset >= prefetched.offset &&
						range.offset + range.length <= prefetched.offset + prefetched.bytes.byteLength;
					if (directoryIsPrefetched)
						return prefetched.bytes.subarray(
							range.offset - prefetched.offset,
							range.offset - prefetched.offset + range.length,
						);
					leafSlab = undefined;
					const length = Math.max(
						range.length,
						Math.min(4 * 1024 * 1024, header.leafDirectoryOffset + leafLength - range.offset),
					);
					const bytes = await this._read({
						archive: params.archive,
						offset: range.offset,
						length: length,
						signal: params.signal,
					});
					leafSlab = { offset: range.offset, bytes: bytes };
					return bytes.subarray(0, range.length);
				},
			};
			let physicalEnd = 0;
			let physicalContents = 0;
			let entries = 0;
			let addresses = 0;
			let previousEnd = 0;
			const zoomStart = (4 ** 15 - 1) / 3;
			const zoomEnd = (4 ** 16 - 1) / 3;
			let selectedEnd = zoomStart;
			const insert = this._repository.prepare({ database: db, sql: "INSERT INTO contents VALUES (?,?,?,?)" });
			const existing = this._repository.prepare({
				database: db,
				sql: "SELECT length,tile_id,multiplicity FROM contents WHERE offset=?",
			});
			const update = this._repository.prepare({
				database: db,
				sql: "UPDATE contents SET tile_id=?,multiplicity=? WHERE offset=?",
			});
			const alias = this._repository.prepare({ database: db, sql: "INSERT INTO aliases VALUES (?,?,?)" });
			const directory = this._repository.prepare({ database: db, sql: "INSERT INTO directories VALUES (?,?)" });
			const root = await this._directory({
				archive: params.archive,
				offset: header.rootDirectoryOffset,
				length: header.rootDirectoryLength,
				header: header,
				signal: params.signal,
			});
			const walk = async (input: { rows: Entry[]; depth: number; upper: number }): Promise<void> => {
				if (input.depth > 3) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
				for (const [index, row] of input.rows.entries()) {
					params.signal?.throwIfAborted();
					const next = input.rows[index + 1]?.tileId ?? input.upper;
					if (row.runLength === 0) {
						this._repository.run({ statement: directory, values: [row.offset, row.length] });
						const children = await this._directory({
							archive: leafArchive,
							offset: header.leafDirectoryOffset + row.offset,
							length: row.length,
							header: header,
							signal: params.signal,
						});
						const directoryStartsAtDeclaredAddress = children[0]?.tileId === row.tileId;
						if (!directoryStartsAtDeclaredAddress)
							throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
						await walk({ rows: children, depth: input.depth + 1, upper: next });
						await setImmediate();
						params.signal?.throwIfAborted();
						continue;
					}
					const end = row.tileId + row.runLength;
					const invalidAddressRun =
						!Number.isSafeInteger(end) ||
						row.tileId < previousEnd ||
						end > next ||
						end > (4 ** (header.maxZoom + 1) - 1) / 3;
					if (invalidAddressRun) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
					previousEnd = end;
					entries++;
					addresses += row.runLength;
					this._range({ offset: row.offset, length: row.length, bytes: header.tileDataLength ?? 0 });
					const from = Math.max(row.tileId, zoomStart);
					const to = Math.min(end, zoomEnd);
					const weight = Math.max(0, to - from);
					if (weight > 0) {
						const sourceCoverageHasGap = from !== selectedEnd;
						if (sourceCoverageHasGap) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE });
						selectedEnd = to;
					}
					const introducesPhysicalContent = row.offset === physicalEnd;
					if (introducesPhysicalContent) {
						physicalEnd += row.length;
						physicalContents++;
						this._repository.run({
							statement: insert,
							values: [row.offset, row.length, weight > 0 ? from : 0, weight],
						});
						if (weight > 1) this._repository.run({ statement: alias, values: [row.offset, from, weight] });
					} else {
						const previous = this._repository.get<{ length: number; tile_id: number; multiplicity: number }>({
							statement: existing,
							values: [row.offset],
						});
						if (previous?.["length"] !== row.length)
							throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
						if (weight === 0) continue;
						const multiplicity = previous.multiplicity;
						const tileId = multiplicity > 0 ? previous.tile_id : from;
						if (multiplicity === 1) this._repository.run({ statement: alias, values: [row.offset, tileId, 1] });
						if (multiplicity > 0 || weight > 1)
							this._repository.run({ statement: alias, values: [row.offset, from, weight] });
						this._repository.run({ statement: update, values: [tileId, multiplicity + weight, row.offset] });
					}
				}
			};
			await walk({ rows: root, depth: 0, upper: Number.MAX_SAFE_INTEGER });
			const completeSourceCoverage = selectedEnd === zoomEnd;
			if (!completeSourceCoverage) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INCOMPLETE });
			const declaredArchiveCountsDiffer =
				entries !== header.numTileEntries ||
				addresses !== header.numAddressedTiles ||
				physicalContents !== header.numTileContents ||
				physicalEnd !== header.tileDataLength;
			if (declaredArchiveCountsDiffer) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INTEGRITY });
			let directoryEnd = 0;
			for (const row of this._repository.iterate<{ offset: number; length: number }>({
				statement: this._repository.prepare({
					database: db,
					sql: "SELECT offset,length FROM directories ORDER BY offset",
				}),
			})) {
				const directoriesAreContiguous = row.offset === directoryEnd;
				if (!directoriesAreContiguous)
					throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
				directoryEnd = row.offset + row.length;
			}
			const leafSectionIsFullyReferenced = directoryEnd === leafLength;
			if (!leafSectionIsFullyReferenced)
				throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			this._repository.execute({ database: db, sql: "COMMIT" });
			await this._write({
				statement: this._repository.prepare({
					database: db,
					sql: "SELECT offset,length,tile_id,multiplicity FROM contents WHERE multiplicity>0 ORDER BY offset",
				}),
				path: membersPath,
				tileDataOffset: header.tileDataOffset,
				aliases: false,
				signal: params.signal,
			});
			await this._write({
				statement: this._repository.prepare({
					database: db,
					sql: "SELECT offset,0,tile_id,run_length FROM aliases ORDER BY offset,tile_id",
				}),
				path: aliasesPath,
				tileDataOffset: header.tileDataOffset,
				aliases: true,
				signal: params.signal,
			});
			success = true;
			return {
				membersPath: membersPath,
				aliasesPath: aliasesPath,
			};
		} finally {
			this._repository.closeDatabase({ database: db });
			for (const path of databaseFiles) this._repository.removeFile({ path: path });
			if (!success) for (const path of [membersPath, aliasesPath]) this._repository.removeFile({ path: path });
		}
	}
	private _number(value: unknown): number {
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
		return value;
	}
	private _range(params: { offset: number; length: number; bytes: number }): void {
		if (
			!Number.isSafeInteger(params.offset) ||
			params.offset < 0 ||
			!Number.isSafeInteger(params.length) ||
			params.length < 1 ||
			!Number.isSafeInteger(params.offset + params.length) ||
			params.offset + params.length > params.bytes
		)
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
	}
	private async _read(params: {
		archive: _Archive;
		offset: number;
		length: number;
		signal: AbortSignal | undefined;
	}): Promise<Uint8Array> {
		params.signal?.throwIfAborted();
		this._range({ offset: params.offset, length: params.length, bytes: params.archive.bytes });
		const bytes = await params.archive.read({ offset: params.offset, length: params.length });
		params.signal?.throwIfAborted();
		if (bytes.byteLength !== params.length)
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
		return bytes;
	}
	private async _directory(params: {
		archive: _Archive;
		offset: number;
		length: number;
		header: Header;
		signal: AbortSignal | undefined;
	}): Promise<Entry[]> {
		const compressed = await this._read({
			archive: params.archive,
			offset: params.offset,
			length: params.length,
			signal: params.signal,
		});
		const bytes = params.header.internalCompression === Compression.Gzip ? gunzipSync(compressed) : compressed;
		const position = { buf: bytes, pos: 0 };
		const next = (): number => {
			let cursor = position.pos;
			while (cursor < bytes.length && (bytes[cursor] ?? 0) >= 128 && cursor - position.pos < 7) cursor++;
			const last = bytes[cursor];
			if (last === undefined || last >= 128 || (cursor - position.pos === 7 && last > 15))
				throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			return readVarint(position);
		};
		const count = next();
		if (count < 1 || count > (bytes.byteLength - position.pos) / 4)
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
		const rows: Entry[] = [];
		let previousId = 0;
		for (let index = 0; index < count; index++) {
			const delta = next();
			if (index > 0 && delta === 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			previousId = this._number(previousId + delta);
			rows.push({ tileId: previousId, offset: 0, length: 0, runLength: 0 });
		}
		for (const row of rows) row.runLength = next();
		for (const row of rows) {
			row.length = next();
			if (row.length === 0) throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
		}
		for (const [index, row] of rows.entries()) {
			const offset = next();
			const previous = rows[index - 1];
			if (offset === 0 && previous === undefined)
				throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
			row.offset =
				offset === 0 && previous !== undefined ? this._number(previous.offset + previous.length) : offset - 1;
		}
		if (position.pos !== bytes.length)
			throw new ReferenceImportError({ code: ReferenceImportErrorCode.INVALID_ARCHIVE });
		return rows;
	}
	private async _write(params: {
		statement: StatementSync;
		path: string;
		tileDataOffset: number;
		aliases: boolean;
		signal: AbortSignal | undefined;
	}): Promise<void> {
		params.signal?.throwIfAborted();
		const fd = this._repository.createFile({ path: params.path });
		const buffer = Buffer.allocUnsafe(1024 * 1024);
		const recordBytes = params.aliases ? 16 : 24;
		let count = 0;
		let position = 0;
		const flush = (): void => {
			for (let offset = 0; offset < position; )
				offset += this._repository.writeFile({
					descriptor: fd,
					buffer: buffer,
					offset: offset,
					length: position - offset,
				});
			position = 0;
		};
		try {
			this._repository.setReturnArrays({ statement: params.statement });
			for (const [offset, length, tileId, multiplicity] of this._repository.iterate<[number, number, number, number]>({
				statement: params.statement,
			})) {
				params.signal?.throwIfAborted();
				if (position + recordBytes > buffer.length) flush();
				buffer.writeBigUInt64LE(BigInt(params.tileDataOffset + offset), position);
				buffer.writeUInt32LE(tileId, position + (params.aliases ? 8 : 12));
				if (params.aliases) buffer.writeUInt32LE(multiplicity, position + 12);
				else {
					buffer.writeUInt32LE(length, position + 8);
					buffer.writeUInt32LE(multiplicity, position + 16);
					buffer.writeUInt32LE(0, position + 20);
				}
				position += recordBytes;
				count++;
				if (count % 65536 === 0) {
					await setImmediate();
					params.signal?.throwIfAborted();
				}
			}
			flush();
		} finally {
			this._repository.closeFile({ descriptor: fd });
		}
	}
}
