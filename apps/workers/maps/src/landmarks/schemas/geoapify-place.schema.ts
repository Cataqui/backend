import { z } from "zod";

// Only the provider fields the landmark selection reads. Raw OpenStreetMap tags keep their provider names.
const OsmTagSchema = z
	.unknown()
	.transform((value) => (typeof value === "string" || typeof value === "number" ? String(value) : undefined));

export const GeoapifyPlaceSchema = z.object({
	properties: z.object({
		name: OsmTagSchema.optional(),
		lat: z.number().min(-90).max(90),
		lon: z.number().min(-180).max(180),
		categories: z.array(z.string()),
		datasource: z
			.object({
				raw: z
					.object({
						short_name: OsmTagSchema.optional(),
						wikidata: OsmTagSchema.optional(),
						brand: OsmTagSchema.optional(),
						tourism: OsmTagSchema.optional(),
						historic: OsmTagSchema.optional(),
					})
					.optional(),
			})
			.optional(),
	}),
});
