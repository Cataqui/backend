import encodeJpeg, { init as initJpegEncoder } from "@jsquash/jpeg/encode";
import jpegEncoderWasm from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import { LandmarkCategory } from "../src/landmarks/landmark-category";
import { LandmarkCompositor } from "../src/landmarks/landmark-compositor";
import { buildLandmarkOverlay } from "../src/landmarks/landmark-overlay";
import { LandmarkLabelPosition } from "../src/landmarks/landmark-selection";

async function _grayJpeg(size: { width: number; height: number }): Promise<Uint8Array> {
	await initJpegEncoder(jpegEncoderWasm);
	const data = new Uint8ClampedArray(size.width * size.height * 4).fill(235);
	return new Uint8Array(
		await encodeJpeg({ data: data, width: size.width, height: size.height, colorSpace: "srgb" } as Parameters<
			typeof encodeJpeg
		>[0]),
	);
}

// Reads the frame size from the JPEG start-of-frame marker.
function _jpegSize(bytes: Uint8Array): { width: number; height: number } {
	let offset = 2;
	while (offset < bytes.length) {
		const marker = bytes[offset + 1]!;
		const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
		if (marker >= 0xc0 && marker <= 0xc2) {
			return {
				height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
				width: (bytes[offset + 7]! << 8) | bytes[offset + 8]!,
			};
		}
		offset += 2 + length;
	}
	throw new Error("No JPEG frame found.");
}

it("renders pins and labels onto the base map as a JPEG at the requested density", async () => {
	const size = { width: 120, height: 80 };
	const svg = buildLandmarkOverlay({
		baseImage: await _grayJpeg({ width: 240, height: 160 }),
		landmarks: [
			{
				label: "Shopping",
				category: LandmarkCategory.SHOPPING_MALL,
				x: 30,
				y: 40,
				labelPosition: LandmarkLabelPosition.RIGHT,
			},
			{
				label: "Madero",
				category: LandmarkCategory.RESTAURANT,
				x: 90,
				y: 60,
				labelPosition: LandmarkLabelPosition.LEFT,
			},
		],
		size: size,
		density: 2,
	});

	const compositor = new LandmarkCompositor();
	const first = await compositor.renderJpeg({ svg: svg });
	const second = await compositor.renderJpeg({ svg: svg });

	expect([first[0], first[1]]).toEqual([0xff, 0xd8]);
	expect(_jpegSize(first)).toEqual({ width: 240, height: 160 });
	expect(second).toEqual(first);
	// A flat gray JPEG compresses to almost nothing; colored pins and text add real detail.
	expect(first.length).toBeGreaterThan((await _grayJpeg({ width: 240, height: 160 })).length * 1.5);
});
