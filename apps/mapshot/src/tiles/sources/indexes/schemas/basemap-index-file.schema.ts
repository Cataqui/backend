import { z } from "zod";

/** All installed files are content addressed below one owned directory. */
export const BasemapIndexFileSchema = z
	.strictObject({
		path: z.string().regex(/^files\/[a-f0-9]{64}\.body$/u),
		sha256: z.string().regex(/^[a-f0-9]{64}$/u),
		bytes: z.int().positive(),
	})
	.refine((file) => file.path === `files/${file.sha256}.body`, { message: "File path must identify its content." });
export type BasemapIndexFile = z.output<typeof BasemapIndexFileSchema>;
