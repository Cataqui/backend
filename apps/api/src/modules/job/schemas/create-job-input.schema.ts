import { z } from "zod";
import { ContactInputSchema } from "../../contact/schemas/contact-input.schema";
import { JobLocationInputSchema } from "./job-location-input.schema";

export const CreateJobInputSchema = z
	.object({
		description: z.string().trim().min(10).max(10_000).describe("The complete job description"),
		location: JobLocationInputSchema.describe("Selected location"),
		contact: ContactInputSchema,
	})
	.strict()
	.meta({ id: "CreateJobInput" });
