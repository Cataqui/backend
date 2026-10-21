export interface MapshotRenderOutput {
	bytes: ReadableStream<Uint8Array>;
	contentType: "image/webp";
	width: number;
	height: number;
	digest: string;
}
