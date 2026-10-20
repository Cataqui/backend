import { z } from "zod";

export const BasemapPromotionManifestBytesLimit = 8 * 1024 * 1024;

export const BasemapPromotionManifestReferenceSchema = z.strictObject({
	key: z.string().regex(/^source\/promotions\/v1\/[a-f0-9]{64}\/assets\.json$/u),
	sha256: z.string().regex(/^[a-f0-9]{64}$/u),
	bytes: z.int().positive().max(BasemapPromotionManifestBytesLimit),
});
export type BasemapPromotionManifestReference = z.output<typeof BasemapPromotionManifestReferenceSchema>;
