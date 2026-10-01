import { LandmarkCategory } from "./landmark-category";
import { buildLandmarkOverlay } from "./landmark-overlay";
import { LandmarkLabelPosition, type PlacedLandmark } from "./landmark-selection";

function _overlay(landmarks: PlacedLandmark[], density = 2) {
	return buildLandmarkOverlay({
		baseImage: new Uint8Array([255, 216, 255, 217]),
		landmarks: landmarks,
		size: { width: 480, height: 1280 },
		density: density,
	});
}

function _landmark(labelPosition: LandmarkLabelPosition, label = "Shopping Anália Franco"): PlacedLandmark {
	return { label: label, category: LandmarkCategory.SHOPPING_MALL, x: 200, y: 600, labelPosition: labelPosition };
}

describe("buildLandmarkOverlay", () => {
	it("renders at the physical density while drawing in logical pixels", () => {
		expect(_overlay([], 2)).toContain('width="960" height="2560" viewBox="0 0 480 1280"');
	});

	it("embeds the base map as the first layer", () => {
		expect(_overlay([])).toContain('<image href="data:image/jpeg;base64,/9j/2Q==" width="480" height="1280"/>');
	});

	it("draws the category badge in the app color with the Mateo icon tinted like the app", () => {
		const svg = _overlay([_landmark(LandmarkLabelPosition.RIGHT)]);
		expect(svg).toContain('<circle cx="200" cy="600" r="14" fill="#2B7FFF"');
		expect(svg).toContain('color="#FCFCFC"');
	});

	it.each([
		[LandmarkLabelPosition.RIGHT, 'x="221" y="605.4" text-anchor="start"'],
		[LandmarkLabelPosition.LEFT, 'x="179" y="605.4" text-anchor="end"'],
		[LandmarkLabelPosition.ABOVE, 'x="200" y="573.75" text-anchor="middle"'],
		[LandmarkLabelPosition.BELOW, 'x="200" y="636" text-anchor="middle"'],
	] as const)("places a %s label next to the badge", (position, expected) => {
		expect(_overlay([_landmark(position)])).toContain(expected);
	});

	it("escapes names so they cannot break the SVG", () => {
		expect(_overlay([_landmark(LandmarkLabelPosition.RIGHT, 'Bar <"A" & B>')])).toContain(
			">Bar &lt;&quot;A&quot; &amp; B&gt;<",
		);
	});

	it("gives repeated icons their own clip path definitions", () => {
		const svg = _overlay([
			{ ..._landmark(LandmarkLabelPosition.RIGHT), category: LandmarkCategory.RESTAURANT },
			{ ..._landmark(LandmarkLabelPosition.LEFT), category: LandmarkCategory.RESTAURANT },
		]);
		expect(new Set(svg.match(/id="[^"]+"/g)).size).toBe(svg.match(/id="[^"]+"/g)?.length);
	});

	it("encodes images larger than one conversion chunk", () => {
		const svg = buildLandmarkOverlay({
			baseImage: new Uint8Array(0x8000 * 2 + 3).fill(65),
			landmarks: [],
			size: { width: 10, height: 10 },
			density: 1,
		});
		expect(svg).toContain(`base64,${btoa("A".repeat(0x8000 * 2 + 3))}"`);
	});
});
