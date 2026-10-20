import { z } from "zod";

/** Prepared bundle returned by ingestion and pinned by deployment. */
export const BasemapPreparedIndexReferenceSchema = z
	.strictObject({
		manifestKey: z.string().regex(/^source\/indexes\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/manifest\.json$/u),
		sha256: z.string().regex(/^[a-f0-9]{64}$/u),
		bytes: z.int().positive(),
		archiveId: z.string().regex(/^[a-f0-9]{64}$/u),
	})
	.refine(
		(reference) =>
			reference.manifestKey === `source/indexes/v1/${reference.archiveId}/${reference.sha256}/manifest.json`,
	);
export type BasemapPreparedIndexReference = z.output<typeof BasemapPreparedIndexReferenceSchema>;
