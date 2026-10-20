import type { MapshotRenderOutput } from "./mapshot-render-output.schema";

export interface IMapshotRpc {
	render(input: {
		center: { latitude: number; longitude: number };
		zoom: number;
		size: { width: number; height: number };
	}): Promise<MapshotRenderOutput>;
}
