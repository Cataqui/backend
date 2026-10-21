import { z } from "zod";

export const NativeRenderHealthOutputSchema = z.strictObject({
	ready: z.literal(true),
	indexes: z
		.strictObject({
			archiveId: z.string().regex(/^[a-f0-9]{64}$/u),
			sha256: z.string().regex(/^[a-f0-9]{64}$/u),
		})
		.optional(),
});

export type NativeRenderHealthOutput = z.output<typeof NativeRenderHealthOutputSchema>;
