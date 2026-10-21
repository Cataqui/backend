import { z } from "zod";
import { createSuccessResponseSchema } from "./success-response.schema";

describe("createSuccessResponseSchema", () => {
	it("should derive the response component ID from the data schema", () => {
		const schema = createSuccessResponseSchema({ dataSchema: z.string().meta({ id: "MessageOutput" }) });

		expect(schema.meta()?.id).toBe("MessageOutputSuccessResponse");
	});

	it("should keep a success response inline when the data schema has no component ID", () => {
		const schema = createSuccessResponseSchema({ dataSchema: z.string() });

		expect(schema.meta()?.id).toBeUndefined();
	});
});

it("validates the payload and complete success envelope", () => {
	const schema = createSuccessResponseSchema({ dataSchema: z.strictObject({ id: z.string() }) });
	const output = {
		data: { id: "account-1" },
		requestId: "request-1",
		timestamp: "2026-10-20T12:00:00.000Z",
		endpoint: "/v1/account",
	} satisfies z.input<typeof schema>;

	expect(schema.parse(output)).toEqual(output);
	expect(schema.safeParse({ ...output, data: { id: 1 } }).success).toBe(false);
	expect(schema.safeParse({ ...output, timestamp: "invalid" }).success).toBe(false);
	expect(schema.safeParse({ ...output, requestId: undefined }).success).toBe(false);
	expect(schema.safeParse({ ...output, internal: true }).success).toBe(false);
	expect(z.toJSONSchema(schema)).toMatchObject({
		additionalProperties: false,
		required: ["data", "requestId", "timestamp", "endpoint"],
		properties: { data: { properties: { id: { type: "string" } } } },
	});
});

it("preserves the payload type in the exported success contract", () => {
	const schema = createSuccessResponseSchema({ dataSchema: z.strictObject({ id: z.string() }) });
	expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<import("./index").SuccessResponse<{ id: string }>>();
});
