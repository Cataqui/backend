import { SourceImportErrorCode } from "./source-import-error-code.enum";
import { join } from "node:path";
import { createHash as createBlake3Hash } from "blake3-wasm";
import { bytesToHeader } from "pmtiles";
import type { PmtilesArchiveRevision } from "../../src/tiles/sources/schemas/pmtiles-archive-revision.schema";
import type { SourceImportCheckpoint } from "./contracts/import/source-import-checkpoint.schema";
import { WorldwideReferenceImportService } from "./references/worldwide/worldwide-reference-import.service";
import { SourceImportError } from "./source-import.error";
import { VerifiedArchiveRepository } from "./verified-archive.repository";
import type { R2ArchiveRangeService } from "./r2-archive-range.service";

export type VerifyArchiveAndExtractLandmarksOutput = {
	archive: PmtilesArchiveRevision;
	landmarks: {
		path: string;
		sha256: string;
		bytes: number;
		archiveId: string;
	};
};

// Specialized archive hashing and extraction; its caller owns storage and durable import state.
export class VerifyArchiveService {
	private readonly _archiveRangeService;
	private readonly _repository: VerifiedArchiveRepository;

	constructor(params: {
		archiveRangeService: R2ArchiveRangeService;
		repository?: VerifiedArchiveRepository;
	}) {
		this._archiveRangeService = params.archiveRangeService;
		this._repository = params.repository ?? new VerifiedArchiveRepository();
	}

	async verifyAndExtractLandmarks(params: {
		checkpoint: SourceImportCheckpoint;
		workDirectory: string;
		deadlineAt: number;
	}): Promise<VerifyArchiveAndExtractLandmarksOutput> {
		const archive = params.checkpoint.input.archive;
		const objectKey = params.checkpoint.objectKey;
		if (params.checkpoint.objectEtag === null) throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
		const etag = params.checkpoint.objectEtag;
		const remainingMilliseconds = params.deadlineAt - Date.now();
		const deadlineExpired = remainingMilliseconds <= 0;
		if (deadlineExpired) throw new SourceImportError({ code: SourceImportErrorCode.ABORTED });
		const signal = AbortSignal.timeout(remainingMilliseconds);
		const readRange = (input: { offset: number; length: number }): Promise<Uint8Array> =>
			this._archiveRangeService.readRange({
				key: objectKey,
				offset: input.offset,
				length: input.length,
				etag: etag,
				signal: signal,
			});
		const headerBytes = await readRange({ offset: 0, length: 127 });
		let header: ReturnType<typeof bytesToHeader>;
		try {
			header = bytesToHeader(new Uint8Array(headerBytes).buffer);
		} catch {
			throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
		}
		const hash = createBlake3Hash();
		let extraction: WorldwideReferenceImportService | null = null;
		try {
			extraction = await WorldwideReferenceImportService.prepare({
				archive: { bytes: archive.bytes, read: readRange },
				workDirectory: params.workDirectory,
				signal: signal,
			});
			const partBytes = 64 * 1024 * 1024;
			for (let offset = 0; offset < archive.bytes; offset += partBytes) {
				if (signal.aborted) throw new SourceImportError({ code: SourceImportErrorCode.ABORTED });
				const length = Math.min(partBytes, archive.bytes - offset);
				const bytes = await readRange({ offset: offset, length: length });
				hash.update(bytes);
				// Decoder workers and disk spools must accept this range before another is fetched.
				await extraction.consume({ offset: offset, bytes: bytes });
			}
			if (hash.digest("hex") !== archive.blake3) throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
			const packed = await extraction.finish();
			if (signal.aborted) throw new SourceImportError({ code: SourceImportErrorCode.ABORTED });
			const path = join(params.workDirectory, "landmarks.pmtiles");
			// Extraction cleanup owns its spool directory; retain only the completed caller-owned file.
			await this._repository.moveLandmarks({ from: packed.path, to: path });
			return {
				archive: {
					id: archive.blake3,
					objectKey: objectKey,
					bytes: archive.bytes,
					etag: etag,
					digest: { algorithm: "blake3", value: archive.blake3, verified: true },
					minZoom: header.minZoom,
					maxZoom: header.maxZoom,
					coverage: "complete-planet",
				},
				landmarks: {
					path: path,
					sha256: packed.sha256,
					bytes: packed.bytes,
					archiveId: archive.blake3,
				},
			};
		} finally {
			hash.dispose();
			await extraction?.dispose();
		}
	}
}
