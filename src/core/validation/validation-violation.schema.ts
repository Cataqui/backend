import { z } from "zod";

export const ValidationViolationSchema = z
	.object({
		path: z
			.array(z.union([z.string(), z.int().nonnegative()]))
			.describe("Ordered object-property names and array indexes locating the invalid request value"),
		message: z.string().describe("Human-readable explanation of why the request value is invalid"),
	})
	.strict()
	.meta({ id: "ValidationViolation" });
