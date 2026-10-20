import { closeSync, openSync, writeSync } from "node:fs";

export class WorldwidePointSpoolRepository {
	open(params: { path: string }): number {
		return openSync(params.path, "wx");
	}

	write(params: { descriptor: number; bytes: Uint8Array; offset: number }): number {
		return writeSync(params.descriptor, params.bytes, params.offset);
	}

	close(params: { descriptor: number }): void {
		closeSync(params.descriptor);
	}
}
