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
