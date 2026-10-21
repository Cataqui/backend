import { z } from "zod";
import { MapshotDeploymentSchema } from "./mapshot-deployment.schema";

// GitHub serializes operations; this conditional R2 journal survives runner interruption.
export const MapshotDeploymentStateSchema = z.strictObject({
	version: z.literal(1),
	active: MapshotDeploymentSchema.nullable(),
	previous: MapshotDeploymentSchema.nullable(),
	pending: z
		.strictObject({
			operation: z.string().regex(/^[a-f0-9]{64}$/),
			codeRevision: MapshotDeploymentSchema.shape.codeRevision,
			slot: MapshotDeploymentSchema.shape.slot,
			stage: z.enum(["clearing", "preparing", "deploying", "recovering"]),
			candidate: MapshotDeploymentSchema.nullable(),
		})
		.nullable(),
});
export type MapshotDeploymentState = z.output<typeof MapshotDeploymentStateSchema>;
