import { z } from "zod";

export const MapAssetSchema = z.strictObject({
	id: z.string().regex(/^[a-f0-9]{64}$/),
	url: z.url({ protocol: /^https$/ }),
});

export type MapAsset = z.output<typeof MapAssetSchema>;
