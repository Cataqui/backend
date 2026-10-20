import { raceWithSignal } from "@cataqui/async";
import type { R2ReadObjectByteRangeInput } from "@cataqui/mapshot-workerhole";
import { MapshotWorkerError } from "../errors/mapshot-worker.error";
import { R2ObjectNotFoundError } from "../errors/r2-object-not-found.error";
import { R2ObjectRevisionMismatchError } from "../errors/r2-object-revision-mismatch.error";
import { R2ObjectRangeMismatchError } from "../errors/r2-object-range-mismatch.error";
import { R2ObjectReadFailedError } from "../errors/r2-object-read-failed.error";
import { R2ObjectReadAbortedError } from "../errors/r2-object-read-aborted.error";
import type { R2Repository } from "./r2.repository";

export class R2Service {
	constructor(private readonly _dependencies: { repository: R2Repository }) {}

	async readObjectByteRange(
		params: R2ReadObjectByteRangeInput & { signal: AbortSignal },
	): Promise<ReadableStream<Uint8Array>> {
		let object: R2ObjectBody | R2Object | null;
		try {
			object = await raceWithSignal(
				() =>
					this._dependencies.repository.readObjectByteRange({
						key: params.key,
						etag: params.etag,
						offset: params.offset,
						length: params.length,
						signal: params.signal,
					}),
				{
					createAbortError: () => new R2ObjectReadAbortedError(),
					signal: params.signal,
				},
			);
		} catch (error) {
			if (error instanceof MapshotWorkerError) throw error;
			throw new R2ObjectReadFailedError();
		}

		if (object === null) throw new R2ObjectNotFoundError();

		if (!("body" in object)) {
			throw new R2ObjectRevisionMismatchError();
		}

		const containsRequestedBytes =
			object.range !== undefined && "length" in object.range && object.range.length === params.length;

		if (!containsRequestedBytes) {
			void object.body.cancel().catch(() => undefined);
			throw new R2ObjectRangeMismatchError();
		}

		return object.body;
	}
}
