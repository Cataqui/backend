import encodeJpeg, { init as initJpegEncoder } from "@jsquash/jpeg/encode";
import jpegEncoderWasm from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import interSemiBold from "./assets/inter-semibold.ttf";
import { LandmarkFontFamily } from "./landmark-overlay";

let _ready: Promise<void> | undefined;

function _initialize(): Promise<void> {
	_ready ??= Promise.all([initResvg(resvgWasm), initJpegEncoder(jpegEncoderWasm)]).then(() => undefined);
	return _ready;
}

/** Rasterizes a landmark overlay SVG (which embeds the base map) into the final stored JPEG. */
export class LandmarkCompositor {
	async renderJpeg(params: { svg: string }): Promise<Uint8Array> {
		await _initialize();
		const rendered = new Resvg(params.svg, {
			font: {
				fontBuffers: [new Uint8Array(interSemiBold)],
				defaultFontFamily: LandmarkFontFamily,
				loadSystemFonts: false,
			},
		}).render();
		// The encoder only reads the RGBA buffer and dimensions; Workers have no ImageData constructor.
		const pixels = {
			data: new Uint8ClampedArray(rendered.pixels),
			width: rendered.width,
			height: rendered.height,
			colorSpace: "srgb",
		} as Parameters<typeof encodeJpeg>[0];
		rendered.free();
		return new Uint8Array(await encodeJpeg(pixels, { quality: 82 }));
	}
}
