import { z } from "zod";

export const PackedLandmarkIndexReferenceSchema = z.strictObject({
	key: z
		.string()
		.max(1024)
		.regex(
			/^source\/import\/attempts\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\/references\/landmarks\.pmtiles$/u,
		),
	sha256: z.string().regex(/^[a-f0-9]{64}$/u),
	bytes: z.int().min(127),
	archiveId: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type PackedLandmarkIndexReference = z.output<typeof PackedLandmarkIndexReferenceSchema>;
