import type { ContainerRenderOutput } from "@cataqui/mapshot-workerhole";

export function createRenderResult(): ContainerRenderOutput {
	return {
		bytes: new Blob([new Uint8Array([1])]).stream(),
		metadata: {
			digest: "a".repeat(64),
			contentType: "image/webp",
			pixelWidth: 960,
			pixelHeight: 960,
		},
	};
}
