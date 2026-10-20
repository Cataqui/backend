import { z } from "zod";
import { BasemapSourceCandidateSchema } from "../../../../src/tiles/sources/schemas/basemap-source-candidate.schema";

// A recoverable deployment includes Worker code/configuration as well as the immutable image.
export const MapshotDeploymentSchema = z.strictObject({
	slot: z.enum(["a", "b"]),
	fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	source: BasemapSourceCandidateSchema,
	codeRevision: z.string().regex(/^[a-f0-9]{40}$/),
	image: z.string().regex(/^[^\s]+@sha256:[a-f0-9]{64}$/),
	artifact: z.strictObject({ key: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
});
export type MapshotDeployment = z.output<typeof MapshotDeploymentSchema>;
