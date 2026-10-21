import { z } from "zod";
import { BasemapSourceReleaseSchema } from "./basemap-source-release.schema";
import { BasemapPreparedIndexReferenceSchema } from "../indexes/schemas/basemap-prepared-index-reference.schema";

/** Prepared data is separate from the active publication until its matching image is tested. */
export const BasemapSourceCandidateSchema = z
	.strictObject({
		release: BasemapSourceReleaseSchema,
		prepared: BasemapPreparedIndexReferenceSchema,
	})
	.refine(
		(candidate) => candidate.release.pmtiles.id === candidate.prepared.archiveId,
		"Prepared indexes must match the selected source.",
	);
export type BasemapSourceCandidate = z.output<typeof BasemapSourceCandidateSchema>;
