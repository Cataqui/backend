import { z } from "zod";
import { PaginationOutputSchema } from "./pagination-output.schema";
import { createSuccessResponseSchema } from "./success-response.schema";

export function createPaginatedSuccessResponseSchema<T extends z.ZodType>(params: { itemSchema: T }) {
	const responseSchema = createSuccessResponseSchema({ dataSchema: z.array(params.itemSchema) }).extend({
		pagination: PaginationOutputSchema.describe("Pagination metadata"),
	});
	const itemSchemaId = params.itemSchema.meta()?.id;

	if (itemSchemaId === undefined) return responseSchema;

	return responseSchema.meta({ id: `${itemSchemaId}PaginatedSuccessResponse` });
}
