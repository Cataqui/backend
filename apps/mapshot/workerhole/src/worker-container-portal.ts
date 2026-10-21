import type { MapshotRenderInput } from "./mapshot-render-input.schema";
import { defineWorkerContainerPortal, type CallContext } from "@cataqui/workerhole";

export interface ContainerRenderOutput {
	bytes: ReadableStream<Uint8Array>;
	metadata: {
		contentType: "image/webp";
		digest: string;
		pixelWidth: number;
		pixelHeight: number;
	};
}

export abstract class MapshotWorkerContainerPortal extends defineWorkerContainerPortal<{
	render(input: MapshotRenderInput, context: CallContext): Promise<ContainerRenderOutput>;
}>() {}
