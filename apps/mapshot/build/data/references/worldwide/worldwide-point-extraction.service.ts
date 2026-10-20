import { ReferenceImportErrorCode } from "../reference-import-error-code.enum.ts";
import { createHash, type Hash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { PackedLandmarkKinds } from "../../../../src/landmark/index/packed-landmark-format.ts";
import { ReferenceImportError } from "../reference-import.error.ts";
import { decodeWorldwidePoints } from "./worldwide-point.decoder.ts";
import { WorldwidePointSpoolRepository } from "./worldwide-point-spool.repository.ts";
import type { WorldwidePointSpoolRow } from "./schemas/worldwide-point-spool-row.schema.ts";

export interface WorldwidePointSpoolOutput {
	file: { path: string; bytes: number; lines: number; sha256: string };
	sharedContents: number;
}

export class WorldwidePointExtractionService {
	private readonly _repository: WorldwidePointSpoolRepository;
	private readonly _descriptor: number;
	private readonly _path: string;
	private readonly _hash: Hash;
	private _lines = 0;
	private _bytes = 0;
	private _pending: string[] = [];
	private _pendingBytes = 0;
	private _sharedContents = 0;
	private _closed = false;

	constructor(params: { path: string }) {
		this._repository = new WorldwidePointSpoolRepository();
		this._descriptor = this._repository.open({ path: params.path });
		this._path = params.path;
		this._hash = createHash("sha256");
	}

	extract(params: { bytes: ArrayBuffer; records: ArrayBuffer }): void {
		if (this._closed)
			throw new ReferenceImportError({
				code: ReferenceImportErrorCode.CLOSED,
				message: "Landmark worker already finished",
			});
		const body = new Uint8Array(params.bytes);
		const records = Buffer.from(params.records);
		const categories = new Set(PackedLandmarkKinds);
		for (let at = 0; at < records.length; at += 24) {
			const offset = records.readUInt32LE(at);
			const length = records.readUInt32LE(at + 4);
			const tileId = records.readUInt32LE(at + 8);
			const multiplicity = records.readUInt32LE(at + 12);
			const physicalOffset = Number(records.readBigUInt64LE(at + 16));
			const decoded = gunzipSync(body.subarray(offset, offset + length));
			const extracted = decodeWorldwidePoints({ bytes: decoded, categories: categories });
			const sharedContentHasPoints = extracted.length > 0 && multiplicity > 1;
			if (sharedContentHasPoints) this._sharedContents += 1;
			for (const point of extracted) {
				const line = `${JSON.stringify([
					physicalOffset,
					multiplicity,
					tileId,
					point.ordinal,
					point.id,
					point.category,
					point.name,
					point.names,
					point.detail,
					point.minZoom,
					point.rank,
					point.u,
					point.v,
				] satisfies WorldwidePointSpoolRow)}\n`;
				this._pending.push(line);
				this._pendingBytes += Buffer.byteLength(line);
				this._lines += 1;
				if (this._pendingBytes >= 256 * 1024) this._flush();
			}
		}
	}

	finish(): WorldwidePointSpoolOutput {
		if (this._closed)
			throw new ReferenceImportError({
				code: ReferenceImportErrorCode.CLOSED,
				message: "Landmark worker already finished",
			});
		this._flush();
		this.close();
		return {
			file: { path: this._path, bytes: this._bytes, lines: this._lines, sha256: this._hash.digest("hex") },
			sharedContents: this._sharedContents,
		};
	}

	close(): void {
		if (this._closed) return;
		this._repository.close({ descriptor: this._descriptor });
		this._closed = true;
	}

	private _flush(): void {
		if (this._pendingBytes === 0) return;
		const body = Buffer.from(this._pending.join(""));
		let written = 0;
		while (written < body.length) {
			const bytes = this._repository.write({ descriptor: this._descriptor, bytes: body, offset: written });
			if (bytes === 0)
				throw new ReferenceImportError({
					code: ReferenceImportErrorCode.INCOMPLETE,
					message: "Landmark point spool write made no progress",
				});
			written += bytes;
		}
		this._hash.update(body);
		this._bytes += body.length;
		this._pending = [];
		this._pendingBytes = 0;
	}
}
