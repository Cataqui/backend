import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";

export class TileIndexRepository {
	private readonly _worker: MapshotWorkerPortal;

	constructor(params: { worker: MapshotWorkerPortal }) {
		this._worker = params.worker;
	}

	readObjectByteRange(params: {
		key: string;
		etag: string;
		offset: number;
		length: number;
		signal: AbortSignal;
	}): ReturnType<MapshotWorkerPortal["readObjectByteRange"]> {
		return this._worker.withOptions({ signal: params.signal }).readObjectByteRange({
			key: params.key,
			etag: params.etag,
			offset: params.offset,
			length: params.length,
		});
	}
}
