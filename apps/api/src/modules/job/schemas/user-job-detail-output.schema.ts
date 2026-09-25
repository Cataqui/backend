import { z } from "zod";
import { JobStatus } from "../../../../generated/prisma/client.js";
import { ContactOutputSchema } from "../../contact/schemas/contact-output.schema";
import { UserJobLocationOutputSchema } from "./user-job-location-output.schema";

export const UserJobDetailOutputSchema = z
	.object({
		jobId: z.uuid().describe("Job unique identifier"),
		title: z.string().describe("Short job title"),
		description: z.string().describe("Detailed description about the job"),
		descriptionSummary: z.string().describe("Worker-focused feed summary generated from the description"),
		contact: ContactOutputSchema.nullable().describe("The job contact, or null if its saved contact was removed"),
		location: UserJobLocationOutputSchema.describe("Selected title and fuzzy public location"),
		payment: z.string().nullable().describe("Payment text derived from the job description, or null when unavailable"),
		status: z.enum([JobStatus.ACTIVE, JobStatus.ARCHIVED]).describe("Job lifecycle status"),
		createdAt: z.iso.datetime().describe("ISO 8601 timestamp of job creation"),
		updatedAt: z.iso.datetime().describe("ISO 8601 timestamp of the last job update"),
	})
	.strict()
	.meta({ id: "UserJobDetailOutput" });
