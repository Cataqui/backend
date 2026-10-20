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

it("validates items, pagination and strict envelope fields", () => {
	const schema = createPaginatedSuccessResponseSchema({ itemSchema: z.strictObject({ id: z.string() }) });
	const output = {
		data: [{ id: "job-1" }],
		pagination: { hasMore: true, nextCursor: "cursor-1" },
		requestId: "request-1",
		timestamp: "2026-10-20T12:00:00.000Z",
		endpoint: "/v1/feed",
	} satisfies z.input<typeof schema>;

	expect(schema.parse(output)).toEqual(output);
	expect(schema.parse({ ...output, data: [], pagination: { hasMore: false, nextCursor: null } }).data).toEqual([]);
	expect(schema.safeParse({ ...output, data: [{ id: 1 }] }).success).toBe(false);
	expect(schema.safeParse({ ...output, pagination: undefined }).success).toBe(false);
	expect(schema.safeParse({ ...output, pagination: { hasMore: false } }).success).toBe(false);
	expect(schema.safeParse({ ...output, pagination: { hasMore: false, nextCursor: null, total: 10 } }).success).toBe(
		false,
	);
	expect(schema.safeParse({ ...output, internal: true }).success).toBe(false);
	expect(z.toJSONSchema(schema)).toMatchObject({
		additionalProperties: false,
		required: ["data", "requestId", "timestamp", "endpoint", "pagination"],
		properties: { data: { type: "array", items: { properties: { id: { type: "string" } } } } },
	});
});

it("preserves item types in the exported paginated contract", () => {
	const schema = createPaginatedSuccessResponseSchema({ itemSchema: z.strictObject({ id: z.string() }) });
	expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<import("./index").PaginatedSuccessResponse<{ id: string }>>();
});
