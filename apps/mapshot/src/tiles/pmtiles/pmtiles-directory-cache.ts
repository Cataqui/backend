import { InvalidPmtilesCacheEntriesError } from "./errors/invalid-pmtiles-cache-entries.error";
import { InvalidPmtilesDecodedEntriesError } from "./errors/invalid-pmtiles-decoded-entries.error";
import { PmtilesDirectoryInvalidError } from "./errors/pmtiles-directory-invalid.error";
import { PmtilesCacheValueMismatchError } from "./errors/pmtiles-cache-value-mismatch.error";
import { PmtilesOperationSignalMissingError } from "./errors/pmtiles-operation-signal-missing.error";
import { PmtilesCompressionUnsupportedError } from "./errors/pmtiles-compression-unsupported.error";

import { Compression, readVarint, ResolvedValueCache, type Entry, type Header, type Source } from "pmtiles";

/** Header/root/leaf LRU of resolved values; never holds a cross-request promise. */
export class PmtilesDirectoryCache extends ResolvedValueCache {
	private readonly _maximumDecodedEntries: number;
	// Different operation Sources never share a pending promise, including across Worker requests.
	private readonly _pendingBySource = new WeakMap<Source, Map<string, Promise<Header | Entry[]>>>();
	private readonly _validatedDirectories = new WeakMap<
		Entry[],
		{ leafDirectoryLength: number | undefined; tileDataLength: number | undefined }
	>();
	constructor(params: { maximumEntries: number; maximumDecodedEntries?: number }) {
		if (!Number.isSafeInteger(params.maximumEntries) || params.maximumEntries < 1)
			throw new InvalidPmtilesCacheEntriesError();
		super(params.maximumEntries);
		this._maximumDecodedEntries = params.maximumDecodedEntries ?? 131072;
		if (!Number.isSafeInteger(this._maximumDecodedEntries) || this._maximumDecodedEntries < 1)
			throw new InvalidPmtilesDecodedEntriesError();
		this.decompress = async (bytes, compression): Promise<ArrayBuffer> => {
			const result = await this.decompressResource({
				bytes: bytes,
				compression: compression,
			});
			const position = { buf: new Uint8Array(result), pos: 0 };
			const count = readVarint(position);
			if (
				!Number.isSafeInteger(count) ||
				count < 1 ||
				position.pos > result.byteLength ||
				(position.pos === 10 && position.buf[9]! > 1) ||
				count * 4 > result.byteLength - position.pos
			)
				throw new PmtilesDirectoryInvalidError();
			// Validate every varint before the authoritative decoder can read beyond its buffer.
			for (let index = 0; index < count * 4; index++) {
				// A complete one-byte varint is already an exact nonnegative integer.
				if (position.buf[position.pos]! < 0x80) {
					position.pos++;
					continue;
				}
				const start = position.pos;
				const value = readVarint(position);
				// Its uint64 reader masks overflow bits in the tenth byte before returning a number.
				if (
					!Number.isSafeInteger(value) ||
					value < 0 ||
					position.pos > result.byteLength ||
					(position.pos - start === 10 && position.buf[position.pos - 1]! > 1)
				)
					throw new PmtilesDirectoryInvalidError();
			}
			if (position.pos !== result.byteLength) throw new PmtilesDirectoryInvalidError();
			return result;
		};
	}
	override prune(): void {
		while (this.cache.size > this.maxCacheEntries || this._entryCount() > this._maximumDecodedEntries) {
			let oldest: string | undefined;
			let used = Infinity;
			for (const [key, value] of this.cache)
				if (value.lastUsed < used) {
					oldest = key;
					used = value.lastUsed;
				}
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
	}
	stats(): { values: number; entries: number } {
		return { values: this.cache.size, entries: this._entryCount() };
	}
	private _entryCount(): number {
		let count = 0;
		for (const value of this.cache.values()) if (Array.isArray(value.data)) count += value.data.length;
		return count;
	}
	override async getHeader(source: Source): Promise<Header> {
		const signal = this._signal(source);
		signal.throwIfAborted();
		const key = source.getKey();
		const cached = this.cache.get(key);
		if (cached !== undefined && !Array.isArray(cached.data) && !(cached.data instanceof ArrayBuffer)) {
			cached.lastUsed = this.counter++;
			return cached.data;
		}
		const pending = this._pending(source);
		const existing = pending.get(key);
		if (existing !== undefined) {
			const header = await existing;
			signal.throwIfAborted();
			if (Array.isArray(header)) throw new PmtilesCacheValueMismatchError();
			return header;
		}
		const operation = (async (): Promise<Header> => {
			const temporary = new ResolvedValueCache(2);
			temporary.decompress = this.decompress;
			const header = await temporary.getHeader(source);
			signal.throwIfAborted();
			for (const [key, value] of temporary.cache) this.cache.set(key, { lastUsed: this.counter++, data: value.data });
			this.prune();
			return header;
		})();
		pending.set(key, operation);
		try {
			return await operation;
		} finally {
			pending.delete(key);
		}
	}
	override async getDirectory(source: Source, offset: number, length: number, header: Header): Promise<Entry[]> {
		const signal = this._signal(source);
		signal.throwIfAborted();
		const key = `${source.getKey()}|${header.etag || ""}|${offset}|${length}`;
		const cached = this.cache.get(key);
		if (cached !== undefined && Array.isArray(cached.data)) {
			cached.lastUsed = this.counter++;
			this._validateEntries(cached.data, header);
			return cached.data;
		}
		const pending = this._pending(source);
		const existing = pending.get(key);
		if (existing !== undefined) {
			const entries = await existing;
			signal.throwIfAborted();
			if (!Array.isArray(entries)) throw new PmtilesCacheValueMismatchError();
			return entries;
		}
		const operation = (async (): Promise<Entry[]> => {
			const temporary = new ResolvedValueCache(2);
			temporary.decompress = this.decompress;
			const entries = await temporary.getDirectory(source, offset, length, header);
			signal.throwIfAborted();
			this._validateEntries(entries, header);
			this.cache.set(key, { lastUsed: this.counter++, data: entries });
			this.prune();
			return entries;
		})();
		pending.set(key, operation);
		try {
			return await operation;
		} finally {
			pending.delete(key);
		}
	}
	private _validateEntries(entries: Entry[], header: Header): void {
		const validated = this._validatedDirectories.get(entries);
		if (
			validated !== undefined &&
			validated.leafDirectoryLength === header.leafDirectoryLength &&
			validated.tileDataLength === header.tileDataLength
		)
			return;
		if (entries.length === 0) throw new PmtilesDirectoryInvalidError();
		let previous = -1;
		for (const entry of entries) {
			const sectionLength = entry.runLength === 0 ? header.leafDirectoryLength : header.tileDataLength;
			if (
				!Number.isSafeInteger(entry.tileId) ||
				!Number.isSafeInteger(entry.offset) ||
				!Number.isSafeInteger(entry.length) ||
				!Number.isSafeInteger(entry.runLength) ||
				entry.tileId <= previous ||
				entry.offset < 0 ||
				entry.length < 1 ||
				entry.runLength < 0 ||
				sectionLength === undefined ||
				!Number.isSafeInteger(entry.offset + entry.length) ||
				entry.offset + entry.length > sectionLength ||
				!Number.isSafeInteger(entry.tileId + entry.runLength)
			)
				throw new PmtilesDirectoryInvalidError();
			previous = entry.tileId;
		}
		// PMTiles only searches these entries. Freeze admitted values so every later hit
		// can reuse validation without rescanning a worldwide directory's entire leaf.
		for (const entry of entries) Object.freeze(entry);
		Object.freeze(entries);
		this._validatedDirectories.set(entries, {
			leafDirectoryLength: header.leafDirectoryLength,
			tileDataLength: header.tileDataLength,
		});
	}
	private _signal(source: Source): AbortSignal {
		if (!("operationSignal" in source) || !(source.operationSignal instanceof AbortSignal))
			throw new PmtilesOperationSignalMissingError();
		return source.operationSignal;
	}
	private _pending(source: Source): Map<string, Promise<Header | Entry[]>> {
		let pending = this._pendingBySource.get(source);
		if (pending === undefined) {
			pending = new Map();
			this._pendingBySource.set(source, pending);
		}
		return pending;
	}
	async decompressResource(params: { bytes: ArrayBuffer; compression: Compression }): Promise<ArrayBuffer> {
		if (params.compression === Compression.None) return params.bytes;
		if (params.compression !== Compression.Gzip) throw new PmtilesCompressionUnsupportedError();
		return new Response(new Blob([params.bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
	}
}
