import { z } from "zod";
import { JobContactMethod } from "../../../../generated/prisma/client.js";

export const JobContactOutputSchema = z
	.object({
		contactMethod: z.enum(JobContactMethod).describe("Preferred contact method"),
		identifier: z
			.string()
			.describe(
				"Contact identifier such as phone number with country code, email address, etc. Vary depending on the contact method.",
			),
	})
	.strict()
	.meta({ id: "JobContactOutput" });
