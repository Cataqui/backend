import { MapAssetSchema } from "@cataqui/maps-contracts";
import { z } from "zod";

export const StaticInputSchema = z.strictObject({
	id: MapAssetSchema.shape.id,
});
