import { z } from "zod";
import { SourceImportStorageEtagSchema } from "./source-import-storage-etag.schema";
import { SourceImportStorageReadKeySchema } from "./source-import-storage-read-key.schema";

export const R2ArchiveRangeInputSchema = z
	.strictObject({
		key: SourceImportStorageReadKeySchema,
		etag: SourceImportStorageEtagSchema,
		offset: z.int().nonnegative(),
		length: z.int().positive(),
	})
	.refine((input) => Number.isSafeInteger(input.offset + input.length), {
		message: "Range end must be a safe integer.",
	});

export type R2ArchiveRangeInput = z.output<typeof R2ArchiveRangeInputSchema>;
