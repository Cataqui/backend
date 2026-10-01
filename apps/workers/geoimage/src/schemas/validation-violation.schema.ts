import { z } from "zod";

export const ValidationViolationSchema = z
	.strictObject({
		path: z
			.array(z.union([z.string(), z.int().nonnegative()]))
			.describe("Ordered property names and array indexes identifying the invalid value; empty for the whole body"),
		message: z.string().min(1).describe("Developer diagnostic explaining the request constraint that failed"),
	})
	.meta({ ref: "ValidationViolation" });
