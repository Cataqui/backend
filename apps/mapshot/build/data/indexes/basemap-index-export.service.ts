import { createHash } from "node:crypto";
import { join } from "node:path";
import type { BasemapSourceRelease } from "../../../src/tiles/sources/schemas/basemap-source-release.schema";
import type { PackedLandmarkIndexReference } from "../../../src/landmark/index/schemas/packed-landmark-index-reference.schema";
import type { BasemapPreparedIndexReference } from "../../../src/tiles/sources/indexes/schemas/basemap-prepared-index-reference.schema";
import type { R2ArchiveRangeService } from "../r2-archive-range.service";
import { BasemapIndexExportRepository } from "./basemap-index-export.repository";
import { BasemapIndexPreparationService } from "./basemap-index-preparation.service";

export type BasemapIndexExportOutput = {
	reference: BasemapPreparedIndexReference;
	files: { key: string; path: string; bytes: number; sha256: string; contentType: string }[];
};

export class BasemapIndexExportService {
	private readonly _archiveRangeService;
	private readonly _repository;

	constructor(params: {
		archiveRangeService: R2ArchiveRangeService;
		repository?: BasemapIndexExportRepository;
	}) {
		this._archiveRangeService = params.archiveRangeService;
		this._repository = params.repository ?? new BasemapIndexExportRepository();
	}

	async export(params: {
		release: BasemapSourceRelease;
		landmarks: PackedLandmarkIndexReference;
		workDirectory: string;
		deadlineAt: number;
	}): Promise<BasemapIndexExportOutput> {
		const remainingMilliseconds = params.deadlineAt - Date.now();
		const deadlineExpired = remainingMilliseconds <= 0;
		if (deadlineExpired) throw new DOMException("Mapshot index export deadline expired.", "TimeoutError");
		const signal = AbortSignal.timeout(remainingMilliseconds);
		const directory = await this._repository.createDirectory({ prefix: join(params.workDirectory, "indexes-") });
		const files: BasemapIndexExportOutput["files"] = [];
		try {
			const reference = await new BasemapIndexPreparationService({
				repository: {
					readRange: (request) =>
						this._archiveRangeService.readRange({
							key: request.archive.objectKey,
							offset: request.offset,
							length: request.length,
							etag: request.archive.etag,
							signal: request.signal ?? signal,
						}),
					putObject: async (request) => {
						const path = join(directory, `${files.length}.body`);
						await this._repository.writeFile({
							path: path,
							bytes: request.bytes,
							signal: request.signal ?? signal,
						});
						files.push({
							key: request.key,
							path: path,
							bytes: request.bytes.length,
							sha256: createHash("sha256").update(request.bytes).digest("hex"),
							contentType: request.contentType,
						});
					},
				},
			}).prepare({ release: params.release, landmarks: params.landmarks, signal: signal });
			return { reference: reference, files: files };
		} catch (error) {
			await this._repository.removeDirectory({ path: directory });
			throw error;
		}
	}
}
