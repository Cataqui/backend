import { z } from "zod";

export function createSuccessResponseSchema<T extends z.ZodType>(params: {
	dataSchema: T;
}): z.ZodObject<
	{ data: T; requestId: z.ZodString; timestamp: z.ZodISODateTime; endpoint: z.ZodString },
	z.core.$strict
> {
	const responseSchema = z
		.object({
			data: params.dataSchema.describe("The response payload"),
			requestId: z.string().describe("Unique request identifier for tracing"),
			timestamp: z.iso.datetime().describe("ISO 8601 timestamp of when the response was generated"),
			endpoint: z.string().describe("The requested endpoint path"),
		})
		.strict();

	const dataSchemaId = params.dataSchema.meta()?.id;

	if (dataSchemaId === undefined) return responseSchema;

	return responseSchema.meta({ id: `${dataSchemaId}SuccessResponse` });
}

export type SuccessResponse<T> = z.infer<ReturnType<typeof createSuccessResponseSchema<z.ZodType<T>>>>;
