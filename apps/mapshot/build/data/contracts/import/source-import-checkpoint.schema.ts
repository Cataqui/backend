import { SourceImportStatusErrorCode } from "./source-import-status-error-code.enum";
import { z } from "zod";
import { BasemapSourceCandidateSchema } from "../../../../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { SourceImportJobSchema } from "./source-import-job.schema";
import { PmtilesArchiveRevisionSchema } from "../../../../src/tiles/sources/schemas/pmtiles-archive-revision.schema";
import { PackedLandmarkIndexReferenceSchema } from "../../../../src/landmark/index/schemas/packed-landmark-index-reference.schema";

// R2 persists progress before ambiguous multipart operations; process memory is disposable.
export const SourceImportCheckpointSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		id: SourceImportJobSchema.shape.id,
		input: SourceImportJobSchema,
		generation: z.int().min(0).max(3),
		stage: z.enum(["planning", "creating", "uploading", "completing", "verifying", "references", "ready"]),
		updatedAt: z.int().nonnegative(),
		objectKey: z.string().min(1).max(1024),
		uploadId: z.string().min(1).max(1024).nullable(),
		sourceEtag: z.string().min(1).max(256).nullable(),
		objectEtag: z.string().min(1).max(256).nullable(),
		verifiedArchive: PmtilesArchiveRevisionSchema.nullable(),
		packedIndex: PackedLandmarkIndexReferenceSchema.nullable(),
		parts: z
			.array(z.strictObject({ partNumber: z.int().min(1).max(10000), etag: z.string().min(1).max(256) }))
			.max(10000),
		status: z.discriminatedUnion("kind", [
			z.strictObject({
				kind: z.literal("running"),
				id: SourceImportJobSchema.shape.id,
				phase: z.enum(["planning", "transferring", "verifying", "references"]),
				updatedAt: z.int().nonnegative(),
			}),
			BasemapSourceCandidateSchema.safeExtend({
				kind: z.literal("ready"),
				id: SourceImportJobSchema.shape.id,
			}),
			z.strictObject({
				kind: z.literal("failed"),
				id: SourceImportJobSchema.shape.id,
				code: z.enum(SourceImportStatusErrorCode),
				retryable: z.boolean(),
			}),
		]),
	})
	.superRefine((value, context) => {
		const jobIdentityMatches = value.input.id === value.id && value.status.id === value.id;
		if (!jobIdentityMatches) context.addIssue({ code: "custom", message: "Job identity must match." });
		const partNumbersAreUnique = new Set(value.parts.map((part) => part.partNumber)).size === value.parts.length;
		if (!partNumbersAreUnique) context.addIssue({ code: "custom", message: "Part numbers must be unique." });
		const archiveKeyBelongsToAttempt =
			value.objectKey ===
			(value.input.objectKey ?? `source/import/attempts/${value.id}/${value.generation}/archive.pmtiles`);
		if (!archiveKeyBelongsToAttempt)
			context.addIssue({ code: "custom", message: "Archive key must belong to this attempt." });
		const readyStageMatchesStatus = (value.stage === "ready") === (value.status.kind === "ready");
		if (!readyStageMatchesStatus)
			context.addIssue({ code: "custom", message: "A ready checkpoint must contain its verified release." });
		const packedIndexMatchesVerifiedAttempt =
			value.packedIndex === null ||
			(value.verifiedArchive !== null &&
				value.packedIndex.key ===
					`source/import/attempts/${value.id}/${value.generation}/references/landmarks.pmtiles` &&
				value.packedIndex.archiveId === value.verifiedArchive.id);
		if (!packedIndexMatchesVerifiedAttempt)
			context.addIssue({ code: "custom", message: "Landmark index must belong to this verified attempt." });
		const readySourceMatchesVerifiedReceipts =
			value.status.kind !== "ready" ||
			(JSON.stringify(value.status.release.pmtiles) === JSON.stringify(value.verifiedArchive) &&
				value.status.release.references.id === value.packedIndex?.sha256 &&
				value.status.release.references.catalogueKey === value.packedIndex?.key);
		if (!readySourceMatchesVerifiedReceipts)
			context.addIssue({
				code: "custom",
				message: "The ready source must match its verified archive and landmark receipts.",
			});
		if (value.verifiedArchive !== null) {
			const archive = value.verifiedArchive;
			const verifiedArchiveMatchesSource =
				archive.objectKey === value.objectKey &&
				archive.etag === value.objectEtag &&
				archive.bytes === value.input.archive.bytes &&
				archive.digest.algorithm === "blake3" &&
				archive.digest.value === value.input.archive.blake3;
			if (!verifiedArchiveMatchesSource)
				context.addIssue({
					code: "custom",
					message: "Verified archive must match this stored attempt.",
				});
		}
	});

export type SourceImportCheckpoint = z.output<typeof SourceImportCheckpointSchema>;
