import { z } from "zod";

export const MapshotRenderInputSchema = z.strictObject({
	center: z.strictObject({
		latitude: z.number().min(-85.0511287798066).max(85.0511287798066),
		longitude: z.number().min(-180).max(180),
	}),
	zoom: z.number().refine((zoom) => {
		const world = 512 * 2 ** zoom;
		return Number.isFinite(world) && world > 0;
	}, "Zoom must produce a finite, positive Mercator scale."),
	size: z.strictObject({ width: z.int().positive(), height: z.int().positive() }),
});

export type MapshotRenderInput = z.output<typeof MapshotRenderInputSchema>;
