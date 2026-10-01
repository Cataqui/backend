import { z } from "zod";
import { GeoimageErrorCode } from "./geoimage-error-code.enum";
import { ValidationViolationSchema } from "./schemas/validation-violation.schema";

export const GeoimageErrorOutputSchema = z.discriminatedUnion("errorCode", [
	z.strictObject({
		errorCode: z.literal(GeoimageErrorCode.VALIDATION_ERROR),
		violations: z.array(ValidationViolationSchema).min(1),
	}),
	z.strictObject({ errorCode: z.enum(GeoimageErrorCode).exclude([GeoimageErrorCode.VALIDATION_ERROR]) }),
]);
