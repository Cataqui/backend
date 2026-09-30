import { z } from "zod";

export const MapDensitySchema = z.union([z.literal(1), z.literal(2)], { error: "Density must be 1 or 2." });
