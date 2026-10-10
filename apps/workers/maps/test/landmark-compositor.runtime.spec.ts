import { LandmarkCategory } from "../src/landmarks/landmark-category";
import { LandmarkCompositor } from "../src/landmarks/landmark-compositor";
import { buildLandmarkOverlay } from "../src/landmarks/landmark-overlay";
import { LandmarkLabelPosition } from "../src/landmarks/landmark-selection";

// A flat gray 240x160 PNG; pins add visible color and label detail to this fixture.
const _base = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAABwUlEQVR4nO3SQQkAMAzAwPq3WhM1MRiEOwV5ZBZC5ncAvGRoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQYmhRDk2JoUgxNiqFJMTQphibF0KQcZ7MuNLlFx/4AAAAASUVORK5CYII=",
	),
	(character) => character.charCodeAt(0),
);

it("renders PNG base maps with pins at 2x density before WebP encoding", async () => {
	const svg = buildLandmarkOverlay({
		baseImage: _base,
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
		size: { width: 120, height: 80 },
		density: 2,
	});
	const compositor = new LandmarkCompositor();
	const first = await compositor.renderPng({ svg: svg });
	const second = await compositor.renderPng({ svg: svg });
	expect(Array.from(first.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	const header = new DataView(first.buffer, first.byteOffset, first.byteLength);
	expect({ width: header.getUint32(16), height: header.getUint32(20) }).toEqual({ width: 240, height: 160 });
	expect(second).toEqual(first);
	expect(first.length).toBeGreaterThan(_base.length * 1.5);
});
