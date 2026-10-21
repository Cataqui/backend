import { z } from "zod";

// Descriptor discovered from official metadata; its digest is expected until stored bytes are verified.
export const ProtomapsSourceArchiveSchema = z.strictObject({
	key: z.string().regex(/^\d{8}\.pmtiles$/),
	bytes: z.int().min(127),
	blake3: z.string().regex(/^[a-f0-9]{64}$/),
	version: z.string().regex(/^4\.\d+\.\d+$/),
	observedAt: z.int().nonnegative(),
});
export type ProtomapsSourceArchive = z.output<typeof ProtomapsSourceArchiveSchema>;
