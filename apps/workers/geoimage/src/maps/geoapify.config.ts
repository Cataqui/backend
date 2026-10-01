import type { z } from "zod";
import { GeoimageErrorCode } from "../geoimage-error-code.enum";
import { GeoimageError } from "../geoimage.error";
import { GeoapifyConfigSchema } from "./schemas/geoapify-config.schema";

export type GeoapifyConfig = z.infer<typeof GeoapifyConfigSchema>;

export function getGeoapifyConfig(params: { env: Pick<GeoimageWorkerEnv, "GEOAPIFY_API_KEY"> }): GeoapifyConfig {
	const result = GeoapifyConfigSchema.safeParse({ apiKey: params.env.GEOAPIFY_API_KEY });

	if (!result.success) {
		throw new GeoimageError(GeoimageErrorCode.INTERNAL_ERROR);
	}

	return result.data;
}
