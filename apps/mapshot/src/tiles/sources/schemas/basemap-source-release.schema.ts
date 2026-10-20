import { z } from "zod";
import { PmtilesArchiveRevisionSchema } from "./pmtiles-archive-revision.schema";

export const BasemapSourceReleaseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	pmtiles: PmtilesArchiveRevisionSchema.refine((archive) => archive.coverage === "complete-planet", {
		message: "Published basemap sources must cover the complete planet.",
	}),
	references: z.strictObject({
		id: z.string().regex(/^[a-f0-9]{64}$/),
		catalogueKey: z
			.string()
			.min(1)
			.max(1024)
			.regex(/^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/),
	}),
});

export type BasemapSourceRelease = z.output<typeof BasemapSourceReleaseSchema>;
