import { z } from "zod";
import { StaticMapSizeSchema } from "./static-map-size.schema";

export const StaticReadQueryInputSchema = z.strictObject({
	size: StaticMapSizeSchema.describe(
		"Logical viewport size at zoom 13, forwarded to Mapshot. Mapshot owns label scaling, encoding and 2× resolution: 480x480 returns 960x960 pixels; 480x1280 returns 960x2560 pixels. Attribution must be displayed by the consuming frontend.",
	),
});
