import { closeSync, fstatSync, openSync, readSync, type Stats } from "node:fs";

export class LandmarkIndexRepository {
	private readonly _file: number;

	constructor(params: { path: string }) {
		this._file = openSync(params.path, "r");
	}

	stat(): Stats {
		return fstatSync(this._file);
	}

	read(params: { bytes: Uint8Array; offset: number; length: number; position: number }): number {
		return readSync(this._file, params.bytes, params.offset, params.length, params.position);
	}

	close(): void {
		closeSync(this._file);
	}
}
