import { z } from "zod";
import { MapAssetSchema } from "./map-asset.schema.js";

export const GenerateStaticMapsResultSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("ready"), asset: MapAssetSchema }),
	z.strictObject({
		kind: z.literal("failed"),
		code: z.enum([
			"INVALID_INPUT",
			"PROVIDER_UNAVAILABLE",
			"PROVIDER_TIMEOUT",
			"TRANSFORMATION_UNAVAILABLE",
			"STORAGE_UNAVAILABLE",
			"INTERNAL_ERROR",
		]),
		retryable: z.boolean(),
		violations: z
			.array(z.strictObject({ path: z.string(), message: z.string() }))
			.min(1)
			.optional(),
	}),
]);

export type GenerateStaticMapsResult = z.output<typeof GenerateStaticMapsResultSchema>;
