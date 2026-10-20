import { z } from "zod";
import { BasemapSourceCandidateSchema } from "../../../../src/tiles/sources/schemas/basemap-source-candidate.schema";
import { BasemapPromotionManifestReferenceSchema } from "../promotion/basemap-promotion-manifest-reference.schema";
export const MapshotPromotionSchema = z.strictObject({
	operation: z.string().regex(/^[a-f0-9]{64}$/),
	source: BasemapSourceCandidateSchema,
	inventory: BasemapPromotionManifestReferenceSchema,
});
