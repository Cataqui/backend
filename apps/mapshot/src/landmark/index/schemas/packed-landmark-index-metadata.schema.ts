import { z } from "zod";

export const PackedLandmarkIndexMetadataSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		format: z.literal("mapshot-landmark-points-v1"),
		coverage: z.literal("worldwide-source-zoom-15"),
		sourceZoom: z.literal(15),
		indexZoom: z.literal(13),
		columns: z.tuple([
			z.literal("id"),
			z.literal("name"),
			z.literal("names"),
			z.literal("category"),
			z.literal("detail"),
			z.literal("lon"),
			z.literal("lat"),
			z.literal("minZoom"),
			z.literal("rank"),
		]),
		records: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		cells: z
			.int()
			.nonnegative()
			.max(2 ** 26),
	})
	.refine((value) => (value.records === 0) === (value.cells === 0) && value.cells <= value.records, {
		message: "Occupied cells and canonical records must agree.",
	});

export type PackedLandmarkIndexMetadata = z.output<typeof PackedLandmarkIndexMetadataSchema>;
