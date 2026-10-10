import { z } from "zod";
import { StaticOutputs } from "../static-outputs";
import { StaticStyle } from "../static-style";

export const StaticVariantInputSchema = z.strictObject({
	size: z.string().regex(/^[1-9][0-9]*x[1-9][0-9]*$/, "size must contain positive integer dimensions, such as 480x480"),
	scale: z
		.string()
		.regex(/^[1-9][0-9]*$/, "scale must be a positive integer")
		.default(String(StaticOutputs.scaleFactor)),
	zoom: z
		.string()
		.regex(/^(0|[1-9][0-9]*)$/, "zoom must be a nonnegative integer")
		.default(String(StaticStyle.zoom)),
});
