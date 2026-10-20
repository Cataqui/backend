import { z } from "zod";
import { SourceImportStorageReadKeySchema } from "../import/source-import-storage-read-key.schema";
import { SourceImportStorageEtagSchema } from "../import/source-import-storage-etag.schema";

export const BasemapPromotionAssetSchema = z.strictObject({
	key: SourceImportStorageReadKeySchema,
	bytes: z.int().positive(),
	etag: SourceImportStorageEtagSchema,
	sha256: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
	contentType: z.string().min(1).max(128),
});
export type BasemapPromotionAsset = z.output<typeof BasemapPromotionAssetSchema>;
