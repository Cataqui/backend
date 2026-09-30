import { z } from "zod";
import { GeovisualErrorCode } from "./geovisual-error-code.enum";
import { ValidationViolationSchema } from "./schemas/validation-violation.schema";

export const GeovisualErrorOutputSchema = z.discriminatedUnion("errorCode", [
	z.strictObject({
		errorCode: z.literal(GeovisualErrorCode.VALIDATION_ERROR),
		violations: z.array(ValidationViolationSchema).min(1),
	}),
	z.strictObject({ errorCode: z.enum(GeovisualErrorCode).exclude([GeovisualErrorCode.VALIDATION_ERROR]) }),
]);
