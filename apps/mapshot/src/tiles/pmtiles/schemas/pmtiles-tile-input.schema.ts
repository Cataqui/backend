import { z } from "zod";

export const PmtilesTileInputSchema = z
	.strictObject({
		// PMTiles uses JavaScript numbers for Hilbert tile IDs and cannot represent zoom 27.
		z: z.int().min(0).max(26),
		x: z.int().nonnegative(),
		y: z.int().nonnegative(),
	})
	.superRefine((tile, context) => {
		for (const axis of ["x", "y"] as const) {
			if (tile[axis] >= 2 ** tile.z)
				context.addIssue({ code: "custom", path: [axis], message: "Coordinate must fit zoom" });
		}
	});

export type PmtilesTileInput = z.infer<typeof PmtilesTileInputSchema>;
