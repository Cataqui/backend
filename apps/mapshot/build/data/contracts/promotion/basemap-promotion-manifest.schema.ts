import { z } from "zod";
import { BasemapPromotionDescriptorSchema } from "./basemap-promotion-descriptor.schema";

export const BasemapPromotionManifestSchema = z.strictObject({
	version: z.literal(1),
	pages: z.array(BasemapPromotionDescriptorSchema).min(1),
});

export type BasemapPromotionManifest = z.output<typeof BasemapPromotionManifestSchema>;
