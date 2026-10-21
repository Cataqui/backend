import { z } from "zod";
import { SourceImportJobSchema } from "../import/source-import-job.schema";
import { BasemapSourceCandidateSchema } from "../../../../src/tiles/sources/schemas/basemap-source-candidate.schema";
// A slot preparation pins discovery across GitHub jobs and retries.
export const MapshotPreparationSchema = z.strictObject({
	operation: z.string().regex(/^[a-f0-9]{64}$/),
	input: SourceImportJobSchema.nullable(),
	source: BasemapSourceCandidateSchema.nullable(),
});
