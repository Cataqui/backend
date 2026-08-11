import { z } from "zod";
import { JobType } from "../../../../generated/prisma/client.js";
import { ContactInputSchema } from "../../user/schemas/contact-input.schema";
import { JobLocationInputSchema } from "./job-location-input.schema";
import { JobPaymentInputSchema } from "./job-payment-input.schema";

export const UpdateJobInputSchema = z
	.object({
		description: z.string().trim().min(10).max(10_000).optional().describe("The new job description"),
		contact: ContactInputSchema.optional().describe("The updated person to contact regarding the job offer"),
		location: JobLocationInputSchema.optional().describe("The updated place where the job will be executed"),
		type: z
			.enum(JobType)
			.optional()
			.describe("The updated type of opportunity: employment-like, contract work, or an individual task"),
		payment: JobPaymentInputSchema.optional().describe("The updated payment details"),
	})
	.strict()
	.describe("Fields to update. Omitted fields remain unchanged.")
	.meta({ id: "UpdateJobInput" });
