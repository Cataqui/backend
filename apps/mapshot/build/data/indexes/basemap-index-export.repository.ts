import { mkdtemp, rm, writeFile } from "node:fs/promises";

export class BasemapIndexExportRepository {
	async createDirectory(params: { prefix: string }): Promise<string> {
		return mkdtemp(params.prefix);
	}

	async writeFile(params: { path: string; bytes: Uint8Array; signal: AbortSignal }): Promise<void> {
		await writeFile(params.path, params.bytes, { flag: "wx", mode: 0o600, signal: params.signal });
	}

	async removeDirectory(params: { path: string }): Promise<void> {
		await rm(params.path, { recursive: true, force: true });
	}
}
