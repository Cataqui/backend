import { GetObjectCommand, type GetObjectCommandOutput, type S3Client } from "@aws-sdk/client-s3";
import type { R2ArchiveRangeInput } from "./contracts/import/r2-archive-range-input.schema";

export class R2ArchiveRangeRepository {
	private readonly _bucket;
	private readonly _client;

	constructor(params: { bucket: string; client: S3Client }) {
		this._bucket = params.bucket;
		this._client = params.client;
	}

	async readRange(params: R2ArchiveRangeInput & { signal: AbortSignal }): Promise<GetObjectCommandOutput> {
		const response = await this._client.send(
			new GetObjectCommand({
				Bucket: this._bucket,
				Key: params.key,
				Range: `bytes=${params.offset}-${params.offset + params.length - 1}`,
				IfMatch: `"${params.etag}"`,
			}),
			{ abortSignal: params.signal },
		);
		if (params.signal.aborted) {
			try {
				void response.Body?.transformToWebStream()
					.cancel()
					.catch(() => undefined);
			} catch {
				// Preserve cancellation if the unused body cannot be converted for cleanup.
			}
			params.signal.throwIfAborted();
		}
		return response;
	}
}
