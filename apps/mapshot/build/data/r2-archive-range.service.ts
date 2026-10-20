import { SourceImportErrorCode } from "./source-import-error-code.enum";
import { raceWithSignal } from "@cataqui/async";
import { type GetObjectCommandOutput, S3ServiceException } from "@aws-sdk/client-s3";
import type { R2ArchiveRangeInput } from "./contracts/import/r2-archive-range-input.schema";
import type { R2ArchiveRangeRepository } from "./r2-archive-range.repository";
import { SourceImportError } from "./source-import.error";

export class R2ArchiveRangeService {
	private readonly _repository;

	constructor(params: { repository: R2ArchiveRangeRepository }) {
		this._repository = params.repository;
	}

	async readRange(params: R2ArchiveRangeInput & { signal: AbortSignal }): Promise<Uint8Array> {
		try {
			return await this._readRange(params);
		} catch (error) {
			const canRetryRange =
				error instanceof SourceImportError &&
				error.retryable &&
				error.code !== SourceImportErrorCode.ABORTED &&
				!params.signal.aborted;
			if (!canRetryRange) throw error;
			return this._readRange(params);
		}
	}

	private async _readRange(params: R2ArchiveRangeInput & { signal: AbortSignal }): Promise<Uint8Array> {
		const signal = params.signal;
		const object = await this._request({
			signal: signal,
			operation: () =>
				this._repository.readRange({
					key: params.key,
					offset: params.offset,
					length: params.length,
					etag: params.etag,
					signal: signal,
				}),
		});
		const expected = new RegExp(`^bytes ${params.offset}-${params.offset + params.length - 1}/([0-9]+)$`).exec(
			object.ContentRange ?? "",
		);
		const unquoted = object.ETag?.startsWith('"') && object.ETag.endsWith('"') ? object.ETag.slice(1, -1) : object.ETag;
		const rangeMatchesRequest =
			unquoted === params.etag &&
			object.ContentLength === params.length &&
			expected?.[1] !== undefined &&
			Number.isSafeInteger(Number(expected[1])) &&
			Number(expected[1]) >= params.offset + params.length;
		if (!rangeMatchesRequest) {
			this._cancel(object.Body);
			throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
		}
		const body = object.Body;
		if (body === undefined) throw new SourceImportError({ code: SourceImportErrorCode.STORAGE });
		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		try {
			reader = await this._request({ signal: signal, operation: async () => body.transformToWebStream().getReader() });
			// Allocate only after metadata admits the exact bounded range. Never collect a second copy in chunks.
			const bytes = new Uint8Array(params.length);
			let offset = 0;
			for (;;) {
				const activeReader = reader;
				const chunk = await this._request({ signal: signal, operation: () => activeReader.read() });
				if (chunk.done) break;
				if (chunk.value.byteLength > bytes.byteLength - offset)
					throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
				bytes.set(chunk.value, offset);
				offset += chunk.value.byteLength;
			}
			if (offset !== bytes.byteLength) throw new SourceImportError({ code: SourceImportErrorCode.INTEGRITY });
			return bytes;
		} finally {
			// Broken providers must not hold completion or cancellation open indefinitely.
			if (reader === undefined) this._cancel(body);
			else {
				const activeReader = reader;
				void activeReader
					.cancel()
					.finally(() => activeReader.releaseLock())
					.catch(() => undefined);
			}
		}
	}

	private _cancel(body: GetObjectCommandOutput["Body"]): void {
		try {
			void body
				?.transformToWebStream()
				.cancel()
				.catch(() => undefined);
		} catch {
			// Body conversion itself may fail; preserve the original owned failure.
		}
	}

	private async _request<T>(params: { operation: () => Promise<T>; signal: AbortSignal }): Promise<T> {
		try {
			return await raceWithSignal(params.operation, {
				signal: params.signal,
				createAbortError: () => new SourceImportError({ code: SourceImportErrorCode.ABORTED }),
			});
		} catch (error) {
			if (error instanceof SourceImportError) throw error;
			throw new SourceImportError({
				code: params.signal.aborted
					? SourceImportErrorCode.ABORTED
					: error instanceof S3ServiceException && [409, 412].includes(error.$metadata.httpStatusCode ?? 0)
						? SourceImportErrorCode.CONFLICT
						: SourceImportErrorCode.STORAGE,
			});
		}
	}
}
