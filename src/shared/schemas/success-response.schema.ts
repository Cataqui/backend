import { z } from "zod";

export function createSuccessResponseSchema<T extends z.ZodType>(params: { dataSchema: T }) {
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
