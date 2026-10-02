// Logical map dimensions; every output currently uses the same 2x scale.
export const StaticOutputs = {
	scaleFactor: 2,
	sizes: [
		{ width: 480, height: 480 },
		{ width: 480, height: 1280 },
	],
} as const;

export interface StaticSize {
	width: number;
	height: number;
}
