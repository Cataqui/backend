import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import interSemiBold from "./assets/inter-semibold.ttf";
import { LandmarkFontFamily } from "./landmark-overlay";

let _ready: Promise<void> | undefined;

/** Rasterizes the base map and landmark overlay losslessly before the Maps WebP encoding stage. */
export class LandmarkCompositor {
	async renderPng(params: { svg: string }): Promise<Uint8Array> {
		_ready ??= initResvg(resvgWasm);
		await _ready;
		const resvg = new Resvg(params.svg, {
			font: {
				fontBuffers: [new Uint8Array(interSemiBold)],
				defaultFontFamily: LandmarkFontFamily,
				loadSystemFonts: false,
			},
		});
		try {
			const rendered = resvg.render();
			try {
				return rendered.asPng();
			} finally {
				rendered.free();
			}
		} finally {
			resvg.free();
		}
	}
}
