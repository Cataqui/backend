import { BasemapIndexIntegrityError } from "../sources/indexes/basemap-index-integrity.error";

import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

import type { BasemapIndexFile } from "../sources/indexes/schemas/basemap-index-file.schema";
import { BasemapIndexInstallationRepository } from "./basemap-index-installation.repository";

export class BasemapIndexInstallationService {
	private readonly _repository: BasemapIndexInstallationRepository;
	readonly root: string;

	constructor(params: { repository: BasemapIndexInstallationRepository }) {
		this._repository = params.repository;
		this.root = params.repository.root;
	}

	static async open(params: { root: string }): Promise<BasemapIndexInstallationService> {
		const repository = new BasemapIndexInstallationRepository(params.root);
		const info = await repository.stat({ path: "." });
		if (!info.isDirectory() || info.isSymbolicLink()) throw new BasemapIndexIntegrityError();
		return new BasemapIndexInstallationService({
			repository: new BasemapIndexInstallationRepository(await repository.realpath({ path: "." })),
		});
	}

	async getFileSize(params: { path: string; expectedBytes?: number }): Promise<number> {
		const path = resolve(this.root, params.path);
		if (!path.startsWith(this.root + sep)) throw new BasemapIndexIntegrityError();
		for (let parent = dirname(path); parent !== this.root; parent = dirname(parent)) {
			const info = await this._repository.stat({ path: parent });
			if (!info.isDirectory() || info.isSymbolicLink()) throw new BasemapIndexIntegrityError();
		}
		const info = await this._repository.stat({ path: path });
		if (
			!info.isFile() ||
			info.isSymbolicLink() ||
			!Number.isSafeInteger(info.size) ||
			(params.expectedBytes !== undefined && info.size !== params.expectedBytes) ||
			!(await this._repository.realpath({ path: path })).startsWith(this.root + sep)
		)
			throw new BasemapIndexIntegrityError();
		return info.size;
	}
	async read(params: {
		path: string;
		expectedBytes?: number;
		offset?: number;
		length?: number;
		signal?: AbortSignal | undefined;
	}): Promise<Uint8Array> {
		params.signal?.throwIfAborted();
		const path = resolve(this.root, params.path);
		if (!path.startsWith(this.root + sep)) throw new BasemapIndexIntegrityError();
		// Image packaging and startup already verify these immutable bundled files.
		const size = params.expectedBytes ?? (await this.getFileSize({ path: params.path }));
		const offset = params.offset ?? 0;
		const length = params.length ?? size;
		if (
			!Number.isSafeInteger(offset) ||
			!Number.isSafeInteger(length) ||
			offset < 0 ||
			length < 0 ||
			!Number.isSafeInteger(offset + length) ||
			offset + length > size
		)
			throw new BasemapIndexIntegrityError();
		const result = await this._repository.read({
			path: path,
			offset: offset,
			length: length,
			signal: params.signal,
		});
		params.signal?.throwIfAborted();
		if (result.length !== length) throw new BasemapIndexIntegrityError();
		return result;
	}
	async readVerified(params: { file: BasemapIndexFile; signal?: AbortSignal | undefined }): Promise<Uint8Array> {
		const bytes = await this.read({
			path: params.file.path,
			expectedBytes: params.file.bytes,
			signal: params.signal,
		});
		if (createHash("sha256").update(bytes).digest("hex") !== params.file.sha256) throw new BasemapIndexIntegrityError();
		return bytes;
	}
}
