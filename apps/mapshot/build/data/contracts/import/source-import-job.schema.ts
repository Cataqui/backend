import { z } from "zod";
import { ProtomapsSourceArchiveSchema } from "../provider/protomaps-source-archive.schema";

export const SourceImportJobSchema = z.strictObject({
	id: z.string().regex(/^[a-f0-9]{64}$/),
	archive: ProtomapsSourceArchiveSchema,
	objectKey: z
		.string()
		.regex(/^source\/slots\/[ab]\/planet\.pmtiles$/)
		.optional(),
});
export type SourceImportJob = z.output<typeof SourceImportJobSchema>;
