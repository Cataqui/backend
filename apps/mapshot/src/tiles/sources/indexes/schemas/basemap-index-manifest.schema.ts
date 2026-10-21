import { z } from "zod";
import { PmtilesArchiveRevisionSchema } from "../../schemas/pmtiles-archive-revision.schema";
import { BasemapIndexFileSchema } from "./basemap-index-file.schema";
import { PackedLandmarkIndexReferenceSchema } from "../../../../landmark/index/schemas/packed-landmark-index-reference.schema";

/** A renderer bundle binds complete planet directories and its matching verified worldwide landmarks. */
export const BasemapIndexManifestSchema = z
	.strictObject({
		version: z.literal(1),
		archive: z
			.strictObject({
				id: PmtilesArchiveRevisionSchema.shape.id,
				bytes: PmtilesArchiveRevisionSchema.shape.bytes,
				digest: PmtilesArchiveRevisionSchema.shape.digest,
				minZoom: PmtilesArchiveRevisionSchema.shape.minZoom,
				maxZoom: PmtilesArchiveRevisionSchema.shape.maxZoom,
			})
			.refine((archive) => archive.id === archive.digest.value && archive.minZoom <= archive.maxZoom),
		landmarks: PackedLandmarkIndexReferenceSchema,
		metadata: z.strictObject({
			headerRoot: BasemapIndexFileSchema.refine((file) => file.bytes >= 127 && file.bytes <= 16384),
			leaves: z.array(
				z.strictObject({
					file: BasemapIndexFileSchema,
					originalOffset: z.int().nonnegative(),
				}),
			),
		}),
	})
	.superRefine((manifest, context) => {
		if (manifest.landmarks.archiveId !== manifest.archive.id)
			context.addIssue({
				code: "custom",
				path: ["landmarks"],
				message: "Landmarks must belong to the same verified planet.",
			});
		let end: number | undefined;
		for (const [index, leaf] of manifest.metadata.leaves.entries()) {
			if (
				leaf.originalOffset < manifest.metadata.headerRoot.bytes ||
				(end !== undefined && leaf.originalOffset !== end) ||
				!Number.isSafeInteger(leaf.originalOffset + leaf.file.bytes) ||
				leaf.originalOffset + leaf.file.bytes > manifest.archive.bytes
			)
				context.addIssue({
					code: "custom",
					path: ["metadata", "leaves", index],
					message: "Leaf chunks must be contiguous and in bounds.",
				});
			end = leaf.originalOffset + leaf.file.bytes;
		}
	});
export type BasemapIndexManifest = z.output<typeof BasemapIndexManifestSchema>;
