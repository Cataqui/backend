import { z } from "zod";
import { createPaginatedSuccessResponseSchema } from "./paginated-success-response.schema";

describe("createPaginatedSuccessResponseSchema", () => {
	it("should derive the paginated response component ID from the item schema", () => {
		const schema = createPaginatedSuccessResponseSchema({ itemSchema: z.string().meta({ id: "FeedItem" }) });

		expect(schema.meta()?.id).toBe("FeedItemPaginatedSuccessResponse");
	});

	it("should keep a paginated response inline when the item schema has no component ID", () => {
		const schema = createPaginatedSuccessResponseSchema({ itemSchema: z.string() });

		expect(schema.meta()?.id).toBeUndefined();
	});
});
