import { z } from "zod";

// Only the provider fields the place lookup reads. Raw OpenStreetMap tags keep their provider names.
const _osmTagSchema = z
	.unknown()
	.transform((value) => (typeof value === "string" || typeof value === "number" ? String(value) : undefined));

export const GeoapifyPlaceOutputSchema = z.object({
	properties: z.object({
		lat: z.number().min(-90).max(90),
		lon: z.number().min(-180).max(180),
		categories: z.array(z.string()),
		datasource: z
			.object({
				raw: z
					.object({
						name: _osmTagSchema.optional(),
						short_name: _osmTagSchema.optional(),
						wikidata: _osmTagSchema.optional(),
						brand: _osmTagSchema.optional(),
					})
					.optional(),
			})
			.optional(),
	}),
});
