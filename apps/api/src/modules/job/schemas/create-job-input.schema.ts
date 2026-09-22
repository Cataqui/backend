import { z } from "zod";
import { ContactInputSchema } from "../../user/schemas/contact-input.schema";
import { JobLocationInputSchema } from "./job-location-input.schema";

export const CreateJobInputSchema = z
	.object({
		description: z.string().trim().min(10).max(10_000).describe("The complete job description"),
		payment: z.string().trim().min(1).max(30).describe("Payment as shown to workers"),
		location: JobLocationInputSchema.describe("Exact job coordinates"),
		contact: ContactInputSchema,
	})
	.strict()
	.meta({ id: "CreateJobInput" });
