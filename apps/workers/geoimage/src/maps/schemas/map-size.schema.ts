import { z } from "zod";
import { MapSizes } from "../map-sizes";

export const MapSizeSchema = z.union(
	Object.values(MapSizes).map((size) =>
		z.strictObject({ width: z.literal(size.width), height: z.literal(size.height) }),
	),
	{
		error: `Map size must be ${Object.values(MapSizes)
			.map((size) => `${size.width} × ${size.height}`)
			.join(" or ")}.`,
	},
);
