import { z } from "zod";

/** Only qualified drawing results become private image metadata. */
export const EngineRenderOutputSchema = z.object({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	bytes: z.number().int().positive(),
	imageBase64: z.string().min(1),
	metrics: z.object({
		inputBytes: z.number().int().nonnegative().optional(),
		parseMs: z.number().nonnegative().optional(),
		compileMs: z.number().nonnegative().optional(),
		placementMs: z.number().nonnegative().optional(),
		geometryMs: z.number().nonnegative().optional(),
		textRasterMs: z.number().nonnegative().optional(),
		totalMs: z.number().nonnegative().optional(),
		cpuMs: z.number().nonnegative().optional(),
		peakRssBytes: z.number().int().nonnegative().optional(),
		textCache: z
			.object({
				fontBytes: z.number().int().nonnegative(),
				fonts: z.number().int().nonnegative(),
				outlineBytes: z.number().int().nonnegative(),
				outlines: z.number().int().nonnegative(),
				outlineHits: z.number().int().nonnegative(),
				outlineMisses: z.number().int().nonnegative(),
				shapeBytes: z.number().int().nonnegative(),
				shapes: z.number().int().nonnegative(),
				shapeHits: z.number().int().nonnegative(),
				shapeMisses: z.number().int().nonnegative(),
				shapePlans: z.number().int().nonnegative().optional(),
				shapePlanHits: z.number().int().nonnegative().optional(),
				shapePlanMisses: z.number().int().nonnegative().optional(),
			})
			.nullable()
			.optional(),
		renderMs: z.number().nonnegative(),
		encodeMs: z.number().nonnegative(),
		acceptedLabelIds: z.array(z.string()),
		missingGlyphs: z.number().int().nonnegative(),
		unsupportedLabels: z.number().int().nonnegative(),
		roiGeometry: z
			.object({ workers: z.number().int().nonnegative(), clipGroups: z.number().int().nonnegative() })
			.nullable()
			.optional(),
		roiFallback: z.string().nullable().optional(),
	}),
});

export type EngineRenderOutput = z.output<typeof EngineRenderOutputSchema>;
