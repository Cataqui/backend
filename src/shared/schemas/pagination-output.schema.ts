import { z } from "zod";

export const PaginationOutputSchema = z
	.object({
		hasMore: z.boolean().describe("Whether more results exist beyond this page"),
		nextCursor: z.string().nullable().describe("Cursor to fetch the next page of results"),
	})
	.strict()
	.meta({ id: "PaginationOutput" });
