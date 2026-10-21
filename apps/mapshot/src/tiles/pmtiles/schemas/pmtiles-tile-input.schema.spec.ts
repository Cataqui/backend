import { PmtilesTileInputSchema } from "./pmtiles-tile-input.schema";

it("accepts bounded tile coordinates and reports every invalid axis", () => {
	expect(PmtilesTileInputSchema.parse({ z: 15, x: 32767, y: 32767 })).toEqual({ z: 15, x: 32767, y: 32767 });
	const invalid = PmtilesTileInputSchema.safeParse({ z: 1, x: 2, y: 2 });
	expect(invalid.success).toBe(false);
	if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.path)).toEqual([["x"], ["y"]]);
	expect(PmtilesTileInputSchema.safeParse({ z: 0, x: 0, y: -1 }).success).toBe(false);
});
