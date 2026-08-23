import { z } from "zod";
import { GeosearchErrorCode } from "./geosearch-error-code.enum";

export const GeosearchErrorOutputSchema = z
	.object({
		errorCode: z.enum(GeosearchErrorCode),
		message: z.string().min(1),
	})
	.strict();
