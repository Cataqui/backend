import { MapshotRenderInputSchema } from "@cataqui/mapshot-workerhole";
import { z } from "zod";
import { LandmarkOutputSchema } from "../../../src/landmark/schemas/landmark-output.schema";

export const EngineFixtureMapInputSchema = MapshotRenderInputSchema.safeExtend({
	catalogue: z.strictObject({
		landmarks: z.array(LandmarkOutputSchema.safeExtend({ coordinates: MapshotRenderInputSchema.shape.center })),
	}),
});
