import { z } from "zod";
import { MapDensitySchema } from "../../schemas/map-density.schema";
import { MapSizeSchema } from "../../schemas/map-size.schema";

export const LocationMapInputSchema = z
	.strictObject({
		size: MapSizeSchema.describe("Logical viewport"),
		density: MapDensitySchema.default(2).describe("Output pixel multiplier"),
	})
	.meta({ ref: "LocationMapInput" });
