import type { R2ReadObjectByteRangeInput } from "@cataqui/mapshot-workerhole";

export class R2Repository {
	constructor(private readonly _bucket: R2Bucket) {}

	async readObjectByteRange(
		params: R2ReadObjectByteRangeInput & { signal: AbortSignal },
	): Promise<R2ObjectBody | R2Object | null> {
		const object = await this._bucket.get(params.key, {
			onlyIf: { etagMatches: params.etag },
			range: { offset: params.offset, length: params.length },
		});
		if (params.signal.aborted && object !== null && "body" in object) void object.body.cancel().catch(() => undefined);
		return object;
	}
}
