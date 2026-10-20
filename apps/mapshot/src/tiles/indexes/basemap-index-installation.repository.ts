import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve } from "node:path";

export class BasemapIndexInstallationRepository {
	constructor(readonly root: string) {}

	stat(params: { path: string }): Promise<Stats> {
		return lstat(resolve(this.root, params.path));
	}

	realpath(params: { path: string }): Promise<string> {
		return realpath(resolve(this.root, params.path));
	}

	async read(params: {
		path: string;
		offset: number;
		length: number;
		signal?: AbortSignal | undefined;
	}): Promise<Uint8Array> {
		const file = await open(resolve(this.root, params.path), constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const bytes = new Uint8Array(params.length);
			let at = 0;
			while (at < params.length) {
				params.signal?.throwIfAborted();
				const result = await file.read(bytes, at, params.length - at, params.offset + at);
				if (result.bytesRead === 0) break;
				at += result.bytesRead;
			}
			return bytes.subarray(0, at);
		} finally {
			await file.close();
		}
	}
}
