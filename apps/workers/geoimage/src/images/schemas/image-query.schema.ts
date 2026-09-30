import { z } from "zod";
import { MapSizes } from "../../maps/map-sizes";
import { MapDensitySchema } from "../../maps/schemas/map-density.schema";
import { MapSizeSchema } from "../../maps/schemas/map-size.schema";

const _sizes = MapSizeSchema.options.map(
	(option) => `${option.shape.width.value}x${option.shape.height.value}` as const,
);
const _densities = MapDensitySchema.options.map((option) => String(option.value));

const _coordinate = z
	.string()
	.trim()
	.min(1, "Coordinate is required.")
	.pipe(z.coerce.number<string>().finite("Coordinate must be a finite number."));

export const ImageQuerySchema = z
	.strictObject({
		latitude: _coordinate.pipe(z.number().min(-90).max(90)).describe("Latitude in degrees, between -90 and 90"),
		longitude: _coordinate.pipe(z.number().min(-180).max(180)).describe("Longitude in degrees, between -180 and 180"),
		size: z
			.enum(_sizes, { error: `Map size must be ${_sizes.join(" or ")}.` })
			.describe("Logical viewport; density multiplies output pixels without changing map area"),
		density: z
			.enum(_densities, { error: `Density must be ${_densities.join(" or ")}.` })
			.default("2")
			.describe("Output pixel multiplier"),
	})
	.meta({ ref: "ImageQuery" })
	.transform((query) => ({
		latitude: query.latitude,
		longitude: query.longitude,
		map: {
			size: MapSizes[query.size],
			density: MapDensitySchema.parse(Number(query.density)),
		},
	}));
