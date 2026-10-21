import { z } from "zod";
// Progress belongs to one reserved production slot and captured staging source.
export const MapshotCopyCheckpointSchema = z.strictObject({
	operation: z.string().regex(/^[a-f0-9]{64}$/),
	page: z.int().nonnegative(),
	asset: z.int().nonnegative(),
	archiveEtag: z.string().nullable(),
	transfer: z
		.strictObject({
			key: z.string(),
			uploadId: z.string(),
			parts: z.array(z.strictObject({ partNumber: z.int().positive(), etag: z.string() })),
		})
		.nullable(),
});
