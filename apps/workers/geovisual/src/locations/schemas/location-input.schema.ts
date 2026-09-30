import { z } from "zod";
import { LocationMapInputSchema } from "./location-map-input.schema";

export const LocationInputSchema = z
	.strictObject({
		latitude: z.number().min(-90).max(90).describe("Latitude in degrees"),
		longitude: z.number().min(-180).max(180).describe("Longitude in degrees"),
		map: LocationMapInputSchema.describe("Map rendering options for this location"),
	})
	.meta({
		ref: "LocationInput",
		examples: [{ latitude: -23.5505, longitude: -46.6333, map: { size: { width: 480, height: 1280 }, density: 2 } }],
	});
