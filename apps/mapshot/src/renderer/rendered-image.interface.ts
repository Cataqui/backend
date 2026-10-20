import type { EngineRenderOutput } from "./schemas/engine-render-output.schema";

export interface RenderedImage {
	bytes: Uint8Array<ArrayBuffer>;
	metadata: {
		contentType: "image/webp";
		digest: string;
		pixelWidth: number;
		pixelHeight: number;
	};
	diagnostics?: EngineRenderOutput["metrics"];
}
