import { z } from "zod";
import { PmtilesTileInputSchema } from "../../pmtiles/schemas/pmtiles-tile-input.schema";

/** A release verified at ingestion; partial range reads cannot verify a whole archive digest. */
export const PmtilesArchiveRevisionSchema = z
	.strictObject({
		id: z.string().min(1),
		objectKey: z.string().min(1).max(1024),
		bytes: z.int().min(127),
		etag: z
			.string()
			.min(1)
			.regex(/^[^"\r\n]+$/),
		digest: z.strictObject({
			algorithm: z.enum(["sha256", "blake3"]),
			value: z.string().regex(/^[a-f0-9]{64}$/),
			verified: z.literal(true),
		}),
		minZoom: PmtilesTileInputSchema.shape.z,
		maxZoom: PmtilesTileInputSchema.shape.z,
		coverage: z.enum(["complete-planet", "complete-country", "finite-fixture"]),
	})
	.refine((revision) => revision.minZoom <= revision.maxZoom, {
		message: "Zoom range must be ordered",
		path: ["maxZoom"],
	})
	.refine((revision) => revision.id === revision.digest.value, {
		message: "Source namespace must be its verified content digest",
		path: ["id"],
	});

export type PmtilesArchiveRevision = z.infer<typeof PmtilesArchiveRevisionSchema>;
