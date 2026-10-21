import { isAbsolute } from "node:path";
import { z } from "zod";
import { BasemapSourceReleaseSchema } from "../../../src/tiles/sources/schemas/basemap-source-release.schema";
import { BasemapIndexManifestSchema } from "../../../src/tiles/sources/indexes/schemas/basemap-index-manifest.schema";
import { PackedLandmarkIndexReferenceSchema } from "../../../src/landmark/index/schemas/packed-landmark-index-reference.schema";
import { SourceImportCheckpointSchema } from "./import/source-import-checkpoint.schema";

const _compute = {
	environment: z.enum(["staging", "production"]),
	workDirectory: z.string().refine(isAbsolute),
	deadlineAt: z.int().positive(),
};

// Ruby owns operations; this boundary accepts only app-owned map computation and contracts.
export const MapshotDomainToolInputSchema = z.discriminatedUnion("operation", [
	z.strictObject({ operation: z.literal("validate"), kind: z.string(), value: z.unknown() }),
	z.strictObject({ operation: z.literal("promotion.pageAssetLimit") }),
	z.strictObject({ operation: z.literal("index.files"), manifest: BasemapIndexManifestSchema }),
	z.strictObject({ ..._compute, operation: z.literal("archive.verify"), checkpoint: SourceImportCheckpointSchema }),
	z
		.strictObject({
			..._compute,
			operation: z.literal("indexes.prepare"),
			release: BasemapSourceReleaseSchema,
			landmarks: PackedLandmarkIndexReferenceSchema,
		})
		.refine((input) => {
			const landmarksMatchRelease =
				input.landmarks.archiveId === input.release.pmtiles.id &&
				input.landmarks.sha256 === input.release.references.id &&
				input.landmarks.key === input.release.references.catalogueKey;
			return landmarksMatchRelease;
		}, "Landmarks must match the source release."),
]);
export type MapshotDomainToolInput = z.output<typeof MapshotDomainToolInputSchema>;
