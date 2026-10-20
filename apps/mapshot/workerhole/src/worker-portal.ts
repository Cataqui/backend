import { defineWorkerPortal, type CallContext } from "@cataqui/workerhole";

export interface R2ReadObjectByteRangeInput {
	key: string;
	etag: string;
	offset: number;
	length: number;
}

export abstract class MapshotWorkerPortal extends defineWorkerPortal<{
	readObjectByteRange(input: R2ReadObjectByteRangeInput, context: CallContext): Promise<ReadableStream<Uint8Array>>;
}>() {}
