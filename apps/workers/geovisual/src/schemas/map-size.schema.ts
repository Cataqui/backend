import { z } from "zod";

export const MapSizeSchema = z.union(
	[
		z.strictObject({ width: z.literal(480), height: z.literal(1280) }),
		z.strictObject({ width: z.literal(480), height: z.literal(480) }),
	],
	{ error: "Map size must be 480 × 1280 or 480 × 480." },
);
