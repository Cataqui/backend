import type { z } from "zod";
import type { MapDensitySchema } from "./schemas/map-density.schema";

export interface MapImageInput {
	center: { latitude: number; longitude: number };
	size: { width: number; height: number };
	density: z.infer<typeof MapDensitySchema>;
}
