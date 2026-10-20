import { z } from "zod";
import { BasemapPromotionAssetSchema } from "./basemap-promotion-asset.schema";

export const BasemapPromotionPageAssetLimit = 100;

export const BasemapPromotionPageSchema = z
	.strictObject({
		version: z.literal(1),
		assets: z.array(BasemapPromotionAssetSchema).min(1).max(BasemapPromotionPageAssetLimit),
	})
	.refine(
		(page) => page.assets.every((asset, index) => index === 0 || page.assets[index - 1]!.key < asset.key),
		"Promotion page assets must have strictly ordered unique keys.",
	);
export type BasemapPromotionPage = z.output<typeof BasemapPromotionPageSchema>;
