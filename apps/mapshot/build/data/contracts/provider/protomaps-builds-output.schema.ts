import { z } from "zod";

// Historic index entries can lack BLAKE3 or use an unsupported major version.
export const ProtomapsBuildsOutputSchema = z.array(
	z.object({
		key: z.string(),
		size: z.int().min(127),
		uploaded: z.iso.datetime(),
		version: z.string(),
		b3sum: z.string().optional(),
	}),
);
