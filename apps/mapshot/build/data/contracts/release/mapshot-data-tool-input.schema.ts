import { isAbsolute } from "node:path";
import { z } from "zod";
import { BasemapSourceCandidateSchema } from "../../../../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { SourceImportPhaseSchema } from "../import/source-import-phase.schema";
import { MapshotDeploymentSchema } from "./mapshot-deployment.schema";
import { MapshotDeploymentStateSchema } from "./mapshot-deployment-state.schema";

const _context = { environment: z.enum(["staging", "production"]) };
const _operationId = z.string().regex(/^[a-f0-9]{64}$/);
const _path = z.string().refine(isAbsolute);
const _deadlineAt = z.int().positive();

// JSON adapter for the existing Node-only data/build libraries; Ruby owns release orchestration.
export const MapshotDataToolInputSchema = z.discriminatedUnion("operation", [
	z.strictObject({ ..._context, operation: z.literal("state.read") }),
	z.strictObject({
		..._context,
		operation: z.literal("state.write"),
		etag: z.string().nullable(),
		value: MapshotDeploymentStateSchema,
	}),
	z.strictObject({
		..._context,
		operation: z.literal("sources.prepare"),
		codeRevision: MapshotDeploymentSchema.shape.codeRevision,
		operationId: _operationId,
		refresh: z.boolean(),
		phase: SourceImportPhaseSchema,
		deadlineAt: _deadlineAt,
	}),
	z.strictObject({
		..._context,
		operation: z.literal("promotion.prepare"),
		codeRevision: MapshotDeploymentSchema.shape.codeRevision,
		operationId: _operationId,
		promote: z.boolean(),
		deadlineAt: _deadlineAt,
	}),
	z.strictObject({
		..._context,
		operation: z.literal("sources.readPrepared"),
		slot: MapshotDeploymentSchema.shape.slot,
		operationId: _operationId,
	}),
	z.strictObject({
		..._context,
		operation: z.literal("reservations.fingerprint"),
		source: BasemapSourceCandidateSchema,
	}),
	z.strictObject({
		..._context,
		operation: z.literal("storage.putArtifact"),
		key: z.string().min(1),
		path: _path,
	}),
	z.strictObject({ ..._context, operation: z.literal("storage.headObject"), key: z.string().min(1) }),
	z
		.strictObject({
			..._context,
			operation: z.literal("storage.readRange"),
			key: z.string().min(1),
			offset: z.int().nonnegative(),
			length: z.int().positive(),
			etag: z.string().min(1),
			path: _path,
		})
		.refine((input) => Number.isSafeInteger(input.offset + input.length), {
			path: ["length"],
			message: "Range end must be a safe integer.",
		}),
	z.strictObject({ ..._context, operation: z.literal("retention.clean") }),
]);
export type MapshotDataToolInput = z.output<typeof MapshotDataToolInputSchema>;
