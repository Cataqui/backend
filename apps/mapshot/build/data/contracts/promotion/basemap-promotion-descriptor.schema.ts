import { z } from "zod";

export const BasemapPromotionDescriptorBytesLimit = 512 * 1024;

// Authenticated bounds for one immutable promotion page.
export const BasemapPromotionDescriptorSchema = z.strictObject({
	key: z.string().regex(/^source\/promotions\/v1\/[a-f0-9]{64}\/pages\/[a-f0-9]{64}\.json$/u),
	bytes: z.int().positive().max(BasemapPromotionDescriptorBytesLimit),
	sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type BasemapPromotionDescriptor = z.output<typeof BasemapPromotionDescriptorSchema>;
