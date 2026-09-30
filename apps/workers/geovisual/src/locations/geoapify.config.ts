import type { z } from "zod";
import { GeovisualErrorCode } from "../geovisual-error-code.enum";
import { GeovisualError } from "../geovisual.error";
import { GeoapifyConfigSchema } from "./schemas/geoapify-config.schema";

export type GeoapifyConfig = z.infer<typeof GeoapifyConfigSchema>;

export function getGeoapifyConfig(params: { env: Pick<GeovisualWorkerEnv, "GEOAPIFY_API_KEY"> }): GeoapifyConfig {
	const result = GeoapifyConfigSchema.safeParse({ apiKey: params.env.GEOAPIFY_API_KEY });

	if (!result.success) {
		throw new GeovisualError(GeovisualErrorCode.INTERNAL_ERROR);
	}

	return result.data;
}
