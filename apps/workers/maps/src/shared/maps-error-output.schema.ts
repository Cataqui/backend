import { z } from "zod";
import { MapsErrorCode } from "./maps-error-code.enum";

export const MapsErrorOutputSchema = z.strictObject({
	errorCode: z.enum(MapsErrorCode),
	message: z.string().min(1),
	violations: z
		.array(z.strictObject({ path: z.string(), message: z.string() }))
		.min(1)
		.optional(),
});
