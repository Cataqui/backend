import { z } from "zod";

export const MapshotRenderOutputSchema = z.strictObject({
	bytes: z.instanceof(ReadableStream<Uint8Array>),
	contentType: z.literal("image/webp"),
	width: z.int().positive(),
	height: z.int().positive(),
	digest: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type MapshotRenderOutput = z.output<typeof MapshotRenderOutputSchema>;
